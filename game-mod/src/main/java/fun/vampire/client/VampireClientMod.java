package fun.vampire.client;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Properties;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

public final class VampireClientMod implements ClientModInitializer {
    private KeyBinding openMenu;
    private static boolean showFpsHud = true;
    private static boolean showMemoryHud = false;
    private static int hudX = 8;
    private static int hudY = 8;
    private static int hudWidth = 220;
    private static final Path CONFIG_FILE = FabricLoader.getInstance().getConfigDir().resolve("vampire-client.properties");

    private static void loadHudSettings() {
        Properties properties = new Properties();
        try (InputStream input = Files.newInputStream(CONFIG_FILE)) {
            properties.load(input);
            showFpsHud = Boolean.parseBoolean(properties.getProperty("hud.fps", "true"));
            showMemoryHud = Boolean.parseBoolean(properties.getProperty("hud.memory", "false"));
            hudX = Math.max(0, Integer.parseInt(properties.getProperty("hud.x", "8")));
            hudY = Math.max(0, Integer.parseInt(properties.getProperty("hud.y", "8")));
            hudWidth = Math.max(140, Math.min(420, Integer.parseInt(properties.getProperty("hud.width", "220"))));
        } catch (Exception ignored) {
            // First launch or malformed config: use the documented defaults.
        }
    }

    private static void saveHudSettings() {
        Properties properties = new Properties();
        properties.setProperty("hud.fps", Boolean.toString(showFpsHud));
        properties.setProperty("hud.memory", Boolean.toString(showMemoryHud));
        properties.setProperty("hud.x", Integer.toString(hudX));
        properties.setProperty("hud.y", Integer.toString(hudY));
        properties.setProperty("hud.width", Integer.toString(hudWidth));
        try {
            Files.createDirectories(CONFIG_FILE.getParent());
            try (OutputStream output = Files.newOutputStream(CONFIG_FILE)) {
                properties.store(output, "Vampire Client HUD settings");
            }
        } catch (java.io.IOException ignored) {
            // Keep the in-memory setting even if the config directory is read-only.
        }
    }
    private static boolean benchmarkActive = false;
    private static long benchmarkStartedAt = 0L;
    private static int benchmarkTicks = 0;
    private static final List<Integer> benchmarkSamples = new ArrayList<>();

    @Override
    public void onInitializeClient() {
        loadHudSettings();
        VampireIdentity.load();
        openMenu = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key.vampireclient.open_menu",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_RIGHT_SHIFT,
            "category.vampireclient"
        ));

        HudRenderCallback.EVENT.register((drawContext, tickCounter) -> {
            if (!showFpsHud && !showMemoryHud) return;
            MinecraftClient client = MinecraftClient.getInstance();
            int rows = (showFpsHud ? 1 : 0) + (showMemoryHud ? 1 : 0);
            int panelHeight = 8 + rows * 16 + 5;
            int panelWidth = hudWidth;
            hudX = Math.max(0, Math.min(hudX, Math.max(0, client.getWindow().getScaledWidth() - panelWidth)));
            hudY = Math.max(0, Math.min(hudY, Math.max(0, client.getWindow().getScaledHeight() - panelHeight)));
            drawContext.fill(hudX, hudY, hudX + panelWidth, hudY + panelHeight, 0xB8101018);
            drawContext.fill(hudX, hudY, hudX + 2, hudY + panelHeight, 0xFFFF596F);
            int y = hudY + 6;
            if (showFpsHud) {
                drawContext.drawTextWithShadow(client.textRenderer,
                    "VAMPIRE  |  " + client.getCurrentFps() + " FPS", hudX + 8, y, 0xFFFF8290);
                y += 16;
            }
            if (showMemoryHud) {
                Runtime runtime = Runtime.getRuntime();
                long used = (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024);
                long max = runtime.maxMemory() / (1024 * 1024);
                drawContext.drawTextWithShadow(client.textRenderer,
                    "MEMORY  |  " + used + " / " + max + " MB", hudX + 8, y, 0xFFF2E8EC);
            }
        });

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (benchmarkActive) {
                benchmarkTicks++;
                if (benchmarkTicks % 20 == 0) benchmarkSamples.add(client.getCurrentFps());
                if (System.currentTimeMillis() - benchmarkStartedAt >= 30_000L) benchmarkActive = false;
            }
            while (openMenu.wasPressed()) {
                if (client.currentScreen == null) client.setScreen(new VampireQuickMenuScreen());
                else if (client.currentScreen instanceof VampireQuickMenuScreen) client.setScreen(null);
            }
        });
    }

    private static void drawPanel(int width, int height, net.minecraft.client.font.TextRenderer textRenderer, net.minecraft.client.gui.DrawContext context, String title) {
        context.fill(0, 0, width, height, 0x55040008);
        context.fill(width / 2 - 190, height / 2 - 130, width / 2 + 190, height / 2 + 130, 0xE8101018);
        context.fill(width / 2 - 190, height / 2 - 130, width / 2 + 190, height / 2 - 128, 0xFFFF596F);
        context.drawCenteredTextWithShadow(textRenderer, "VAMPIRE STUDIOS", width / 2, height / 2 - 116, 0xFFFF7182);
        context.drawCenteredTextWithShadow(textRenderer, title, width / 2, height / 2 - 96, 0xFFFFFFFF);
    }

    private static final class VampireQuickMenuScreen extends Screen {
        protected VampireQuickMenuScreen() { super(Text.literal("Vampire Quick Menu")); }

        @Override
        protected void init() {
            int center = width / 2;
            int top = height / 2 - 66;
            addDrawableChild(ButtonWidget.builder(Text.literal("Mods"), button ->
                client.setScreen(new ModsScreen())).dimensions(center - 100, top, 200, 24).build());
            addDrawableChild(ButtonWidget.builder(Text.literal("Performance"), button ->
                client.setScreen(new PerformanceScreen())).dimensions(center - 100, top + 31, 200, 24).build());
            addDrawableChild(ButtonWidget.builder(Text.literal("HUD & Settings"), button ->
                client.setScreen(new HudSettingsScreen())).dimensions(center - 100, top + 62, 200, 24).build());
            addDrawableChild(ButtonWidget.builder(Text.literal("Identity & Chat Styling"), button ->
                client.setScreen(new IdentitySettingsScreen())).dimensions(center - 100, top + 93, 200, 24).build());
            addDrawableChild(ButtonWidget.builder(Text.literal("Close"), button -> close())
                .dimensions(center - 100, top + 124, 200, 24).build());
        }

        @Override
        public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
            renderBackground(context, mouseX, mouseY, delta);
            drawPanel(width, height, textRenderer, context, "QUICK MENU");
            super.render(context, mouseX, mouseY, delta);
        }
        @Override public boolean shouldPause() { return false; }
    }

    private static final class ModsScreen extends Screen {
        private List<ModContainer> mods;
        protected ModsScreen() { super(Text.literal("Vampire Mods")); }

        @Override
        protected void init() {
            mods = FabricLoader.getInstance().getAllMods().stream()
                .sorted(Comparator.comparing(mod -> mod.getMetadata().getName().toLowerCase()))
                .toList();
            addDrawableChild(ButtonWidget.builder(Text.literal("Back"), button ->
                client.setScreen(new VampireQuickMenuScreen()))
                .dimensions(width / 2 - 75, height / 2 + 92, 150, 22).build());
        }

        @Override
        public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
            renderBackground(context, mouseX, mouseY, delta);
            drawPanel(width, height, textRenderer, context, "LOADED MODS  ·  " + mods.size());
            int y = height / 2 - 76;
            int max = Math.min(mods.size(), 9);
            for (int i = 0; i < max; i++) {
                ModContainer mod = mods.get(i);
                String name = mod.getMetadata().getName();
                String version = mod.getMetadata().getVersion().getFriendlyString();
                context.drawTextWithShadow(textRenderer, name, width / 2 - 150, y + i * 17, 0xFFF2E8EC);
                context.drawTextWithShadow(textRenderer, version, width / 2 + 95, y + i * 17, 0xFFFF8190);
            }
            if (mods.size() > max) {
                context.drawCenteredTextWithShadow(textRenderer,
                    "Showing first " + max + " loaded mods", width / 2, height / 2 + 75, 0xFFAA9AA2);
            }
            super.render(context, mouseX, mouseY, delta);
        }
        @Override public boolean shouldPause() { return false; }
    }

    private static final class PerformanceScreen extends Screen {
        protected PerformanceScreen() { super(Text.literal("Vampire Performance")); }
        @Override protected void init() {
            addDrawableChild(ButtonWidget.builder(Text.literal(benchmarkActive ? "Benchmark running..." : "Start 30s FPS benchmark"), button -> {
                benchmarkSamples.clear();
                benchmarkTicks = 0;
                benchmarkStartedAt = System.currentTimeMillis();
                benchmarkActive = true;
                button.setMessage(Text.literal("Benchmark running..."));
            }).dimensions(width / 2 - 125, height / 2 + 42, 250, 22).build()).active = !benchmarkActive;
            addDrawableChild(ButtonWidget.builder(Text.literal("Back"), button ->
                client.setScreen(new VampireQuickMenuScreen()))
                .dimensions(width / 2 - 75, height / 2 + 72, 150, 22).build());
        }
        @Override public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
            renderBackground(context, mouseX, mouseY, delta);
            drawPanel(width, height, textRenderer, context, "PERFORMANCE");
            Runtime runtime = Runtime.getRuntime();
            long used = (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024);
            long max = runtime.maxMemory() / (1024 * 1024);
            context.drawCenteredTextWithShadow(textRenderer, "Current FPS: " + client.getCurrentFps(),
                width / 2, height / 2 - 65, 0xFFFFFFFF);
            context.drawCenteredTextWithShadow(textRenderer, "Java memory: " + used + " / " + max + " MB",
                width / 2, height / 2 - 45, 0xFFD8C5CC);
            if (benchmarkActive) {
                long elapsed = Math.max(0L, (System.currentTimeMillis() - benchmarkStartedAt) / 1000L);
                context.drawCenteredTextWithShadow(textRenderer, "Benchmark: " + elapsed + " / 30 seconds",
                    width / 2, height / 2 - 17, 0xFFFF8290);
            } else if (!benchmarkSamples.isEmpty()) {
                int min = benchmarkSamples.stream().mapToInt(Integer::intValue).min().orElse(0);
                int maxFps = benchmarkSamples.stream().mapToInt(Integer::intValue).max().orElse(0);
                int avg = (int) Math.round(benchmarkSamples.stream().mapToInt(Integer::intValue).average().orElse(0));
                context.drawCenteredTextWithShadow(textRenderer, "30s result  ·  AVG " + avg + "  MIN " + min + "  MAX " + maxFps,
                    width / 2, height / 2 - 17, 0xFFFF8290);
            } else {
                context.drawCenteredTextWithShadow(textRenderer, "Run a 30-second sample to measure real gameplay FPS.",
                    width / 2, height / 2 - 17, 0xFFB49EA7);
            }
            context.drawCenteredTextWithShadow(textRenderer, "Close background apps and keep the same world/settings when comparing.",
                width / 2, height / 2 + 12, 0xFFB49EA7);
            super.render(context, mouseX, mouseY, delta);
        }
        @Override public boolean shouldPause() { return false; }
    }


    private static final class IdentitySettingsScreen extends Screen {
        private TextFieldWidget startHex;
        private TextFieldWidget endHex;
        protected IdentitySettingsScreen() { super(Text.literal("Vampire Identity")); }
        @Override protected void init() {
            int x = width / 2 - 125;
            int y = height / 2 - 112;
            addDrawableChild(ButtonWidget.builder(chatLabel(), button -> { VampireIdentity.chatGradientEnabled = !VampireIdentity.chatGradientEnabled; VampireIdentity.save(); button.setMessage(chatLabel()); }).dimensions(x, y, 250, 20).build());
            addDrawableChild(ButtonWidget.builder(nametagLabel(), button -> {}).dimensions(x, y + 25, 250, 20).build()).active = false;
            addDrawableChild(ButtonWidget.builder(badgeLabel(), button -> { VampireIdentity.showClientBadge = !VampireIdentity.showClientBadge; VampireIdentity.save(); button.setMessage(badgeLabel()); }).dimensions(x, y + 50, 250, 20).build());
            addDrawableChild(ButtonWidget.builder(gradientLabel(), button -> {
                if ("#FF526F".equals(VampireIdentity.gradientStart)) { VampireIdentity.gradientStart = "#35D6FF"; VampireIdentity.gradientEnd = "#9B5CFF"; }
                else if ("#35D6FF".equals(VampireIdentity.gradientStart)) { VampireIdentity.gradientStart = "#42E695"; VampireIdentity.gradientEnd = "#3BB2B8"; }
                else { VampireIdentity.gradientStart = "#FF526F"; VampireIdentity.gradientEnd = "#9B5CFF"; }
                VampireIdentity.save(); startHex.setText(VampireIdentity.gradientStart); endHex.setText(VampireIdentity.gradientEnd); button.setMessage(gradientLabel());
            }).dimensions(x, y + 75, 250, 20).build());
            startHex = new TextFieldWidget(textRenderer, x, y + 112, 120, 20, Text.literal("Start HEX"));
            startHex.setMaxLength(7); startHex.setText(VampireIdentity.gradientStart);
            startHex.setChangedListener(value -> { if (value.matches("#?[0-9a-fA-F]{6}")) { VampireIdentity.gradientStart = VampireIdentity.normalizeHex(value); VampireIdentity.save(); } });
            endHex = new TextFieldWidget(textRenderer, x + 130, y + 112, 120, 20, Text.literal("End HEX"));
            endHex.setMaxLength(7); endHex.setText(VampireIdentity.gradientEnd);
            endHex.setChangedListener(value -> { if (value.matches("#?[0-9a-fA-F]{6}")) { VampireIdentity.gradientEnd = VampireIdentity.normalizeHex(value); VampireIdentity.save(); } });
            addDrawableChild(startHex); addDrawableChild(endHex);
            addDrawableChild(ButtonWidget.builder(fontLabel(), button -> button.setMessage(fontLabel(VampireIdentity.nextFontPreset()))).dimensions(x, y + 137, 250, 20).build());
            addDrawableChild(ButtonWidget.builder(Text.literal("Reset identity settings"), button -> {
                VampireIdentity.chatGradientEnabled = true; VampireIdentity.nametagGradientEnabled = true; VampireIdentity.showClientBadge = true;
                VampireIdentity.gradientStart = "#FF526F"; VampireIdentity.gradientEnd = "#9B5CFF"; VampireIdentity.fontPreset = "Minecraft Default";
                VampireIdentity.save(); clearAndInit();
            }).dimensions(x, y + 162, 250, 20).build());
            addDrawableChild(ButtonWidget.builder(Text.literal("Back"), button -> client.setScreen(new VampireQuickMenuScreen())).dimensions(x, y + 187, 250, 20).build());
        }
        private static Text chatLabel() { return Text.literal("Chat name gradient: " + (VampireIdentity.chatGradientEnabled ? "ON" : "OFF")); }
        private static Text nametagLabel() { return Text.literal("Overhead nametags: coming soon"); }
        private static Text badgeLabel() { return Text.literal("Logo badge in chat: " + (VampireIdentity.showClientBadge ? "ON" : "OFF")); }
        private static Text gradientLabel() { return Text.literal("Gradient preset: " + VampireIdentity.gradientStart + " -> " + VampireIdentity.gradientEnd); }
        private static Text fontLabel() { return Text.literal("Font preset: " + VampireIdentity.fontPreset); }
        private static Text fontLabel(String preset) { return Text.literal("Font preset: " + preset); }
        @Override public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
            renderBackground(context, mouseX, mouseY, delta); drawPanel(width, height, textRenderer, context, "IDENTITY & CHAT STYLING");
            context.drawTextWithShadow(textRenderer, "START HEX", width / 2 - 125, height / 2 + 13, 0xFFD8C5CC);
            context.drawTextWithShadow(textRenderer, "END HEX", width / 2 + 5, height / 2 + 13, 0xFFD8C5CC);
            super.render(context, mouseX, mouseY, delta);
        }
        @Override public boolean shouldPause() { return false; }
    }

    private static final class HudPositionScreen extends Screen {
        private boolean dragging;
        private boolean resizing;
        private double dragOffsetX;
        private double dragOffsetY;
        private static final int PREVIEW_HEIGHT = 45;
        protected HudPositionScreen() { super(Text.literal("Position Vampire HUD")); }

        @Override protected void init() {
            clampPosition();
            addDrawableChild(ButtonWidget.builder(Text.literal("Reset position"), button -> {
                hudX = 8; hudY = 8; hudWidth = 220; saveHudSettings(); clampPosition();
            }).dimensions(width / 2 - 105, height - 54, 130, 22).build());
            addDrawableChild(ButtonWidget.builder(Text.literal("Done"), button -> client.setScreen(new HudSettingsScreen()))
                .dimensions(width / 2 + 35, height - 54, 70, 22).build());
        }
        private void clampPosition() {
            hudWidth = Math.max(140, Math.min(420, hudWidth));
            hudX = Math.max(0, Math.min(hudX, Math.max(0, width - hudWidth)));
            hudY = Math.max(0, Math.min(hudY, Math.max(0, height - PREVIEW_HEIGHT - 60)));
        }
        @Override public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
            renderBackground(context, mouseX, mouseY, delta);
            drawPanel(width, height, textRenderer, context, "DRAG TO POSITION HUD");
            clampPosition();
            context.fill(hudX, hudY, hudX + hudWidth, hudY + PREVIEW_HEIGHT, 0xD8101018);
            context.fill(hudX, hudY, hudX + 2, hudY + PREVIEW_HEIGHT, 0xFFFF596F);
            context.fill(hudX + hudWidth - 8, hudY + PREVIEW_HEIGHT - 8, hudX + hudWidth, hudY + PREVIEW_HEIGHT, 0xFFFF8290);
            context.drawTextWithShadow(textRenderer, "VAMPIRE  |  120 FPS", hudX + 8, hudY + 7, 0xFFFF8290);
            context.drawTextWithShadow(textRenderer, "MEMORY  |  2048 / 4096 MB", hudX + 8, hudY + 24, 0xFFF2E8EC);
            context.drawCenteredTextWithShadow(textRenderer, "Drag to move · drag bottom-right corner to resize · changes save automatically.", width / 2, height - 78, 0xFFD8C5CC);
            super.render(context, mouseX, mouseY, delta);
        }
        @Override public boolean mouseClicked(double mouseX, double mouseY, int button) {
            if (button == 0 && mouseX >= hudX && mouseX <= hudX + hudWidth && mouseY >= hudY && mouseY <= hudY + PREVIEW_HEIGHT) {
                if (mouseX >= hudX + hudWidth - 14 && mouseY >= hudY + PREVIEW_HEIGHT - 14) resizing = true;
                else { dragging = true; dragOffsetX = mouseX - hudX; dragOffsetY = mouseY - hudY; }
                return true;
            }
            return super.mouseClicked(mouseX, mouseY, button);
        }
        @Override public boolean mouseDragged(double mouseX, double mouseY, int button, double deltaX, double deltaY) {
            if (resizing && button == 0) {
                hudWidth = Math.max(140, Math.min(420, (int)Math.round(mouseX - hudX)));
                clampPosition(); saveHudSettings(); return true;
            }
            if (dragging && button == 0) {
                hudX = (int)Math.round(mouseX - dragOffsetX); hudY = (int)Math.round(mouseY - dragOffsetY);
                clampPosition(); saveHudSettings(); return true;
            }
            return super.mouseDragged(mouseX, mouseY, button, deltaX, deltaY);
        }
        @Override public boolean mouseReleased(double mouseX, double mouseY, int button) {
            if (button == 0 && (dragging || resizing)) { dragging = false; resizing = false; saveHudSettings(); return true; }
            return super.mouseReleased(mouseX, mouseY, button);
        }
        @Override public boolean shouldPause() { return false; }
    }

    private static final class HudSettingsScreen extends Screen {
        private ButtonWidget toggle;
        protected HudSettingsScreen() { super(Text.literal("Vampire HUD Settings")); }
        @Override protected void init() {
            toggle = addDrawableChild(ButtonWidget.builder(fpsLabel(), button -> {
                showFpsHud = !showFpsHud;
                saveHudSettings();
                button.setMessage(fpsLabel());
            }).dimensions(width / 2 - 105, height / 2 - 32, 210, 24).build());
            addDrawableChild(ButtonWidget.builder(memoryLabel(), button -> {
                showMemoryHud = !showMemoryHud;
                saveHudSettings();
                button.setMessage(memoryLabel());
            }).dimensions(width / 2 - 105, height / 2 + 1, 210, 24).build());
            addDrawableChild(ButtonWidget.builder(Text.literal("Position HUD"), button -> client.setScreen(new HudPositionScreen()))
                .dimensions(width / 2 - 105, height / 2 + 34, 210, 24).build());
            addDrawableChild(ButtonWidget.builder(Text.literal("Back"), button ->
                client.setScreen(new VampireQuickMenuScreen()))
                .dimensions(width / 2 - 75, height / 2 + 66, 150, 22).build());
        }
        private static Text fpsLabel() { return Text.literal("FPS HUD: " + (showFpsHud ? "ON" : "OFF")); }
        private static Text memoryLabel() { return Text.literal("Memory HUD: " + (showMemoryHud ? "ON" : "OFF")); }
        @Override public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
            renderBackground(context, mouseX, mouseY, delta);
            drawPanel(width, height, textRenderer, context, "HUD & SETTINGS");
            super.render(context, mouseX, mouseY, delta);
        }
        @Override public boolean shouldPause() { return false; }
    }
}
