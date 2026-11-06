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
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

public final class VampireClientMod implements ClientModInitializer {
    private KeyBinding openMenu;
    private static boolean showFpsHud = true;
    private static boolean showMemoryHud = false;
    private static final Path CONFIG_FILE = FabricLoader.getInstance().getConfigDir().resolve("vampire-client.properties");

    private static void loadHudSettings() {
        Properties properties = new Properties();
        try (InputStream input = Files.newInputStream(CONFIG_FILE)) {
            properties.load(input);
            showFpsHud = Boolean.parseBoolean(properties.getProperty("hud.fps", "true"));
            showMemoryHud = Boolean.parseBoolean(properties.getProperty("hud.memory", "false"));
        } catch (java.io.IOException ignored) {
            // First launch: use the documented defaults.
        }
    }

    private static void saveHudSettings() {
        Properties properties = new Properties();
        properties.setProperty("hud.fps", Boolean.toString(showFpsHud));
        properties.setProperty("hud.memory", Boolean.toString(showMemoryHud));
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
            int bottom = 8 + rows * 16 + 5;
            drawContext.fill(8, 8, 190, bottom, 0xB8101018);
            drawContext.fill(8, 8, 10, bottom, 0xFFFF596F);
            int y = 14;
            if (showFpsHud) {
                drawContext.drawTextWithShadow(client.textRenderer,
                    "VAMPIRE  |  " + client.getCurrentFps() + " FPS", 16, y, 0xFFFF8290);
                y += 16;
            }
            if (showMemoryHud) {
                Runtime runtime = Runtime.getRuntime();
                long used = (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024);
                long max = runtime.maxMemory() / (1024 * 1024);
                drawContext.drawTextWithShadow(client.textRenderer,
                    "MEMORY  |  " + used + " / " + max + " MB", 16, y, 0xFFF2E8EC);
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
        protected IdentitySettingsScreen() { super(Text.literal("Vampire Identity")); }
        @Override protected void init() {
            int x = width / 2 - 125;
            int y = height / 2 - 64;
            addDrawableChild(ButtonWidget.builder(chatLabel(), button -> {
                VampireIdentity.chatGradientEnabled = !VampireIdentity.chatGradientEnabled;
                VampireIdentity.save();
                button.setMessage(chatLabel());
            }).dimensions(x, y, 250, 22).build());
            addDrawableChild(ButtonWidget.builder(nametagLabel(), button -> {
                VampireIdentity.nametagGradientEnabled = !VampireIdentity.nametagGradientEnabled;
                VampireIdentity.save();
                button.setMessage(nametagLabel());
            }).dimensions(x, y + 29, 250, 22).build());
            addDrawableChild(ButtonWidget.builder(badgeLabel(), button -> {
                VampireIdentity.showClientBadge = !VampireIdentity.showClientBadge;
                VampireIdentity.save();
                button.setMessage(badgeLabel());
            }).dimensions(x, y + 58, 250, 22).build());
            addDrawableChild(ButtonWidget.builder(Text.literal("Gradient preset: " + VampireIdentity.gradientStart + " → " + VampireIdentity.gradientEnd), button -> {
                if ("#FF526F".equals(VampireIdentity.gradientStart)) {
                    VampireIdentity.gradientStart = "#35D6FF";
                    VampireIdentity.gradientEnd = "#9B5CFF";
                } else if ("#35D6FF".equals(VampireIdentity.gradientStart)) {
                    VampireIdentity.gradientStart = "#42E695";
                    VampireIdentity.gradientEnd = "#3BB2B8";
                } else {
                    VampireIdentity.gradientStart = "#FF526F";
                    VampireIdentity.gradientEnd = "#9B5CFF";
                }
                VampireIdentity.save();
                button.setMessage(Text.literal("Gradient preset: " + VampireIdentity.gradientStart + " → " + VampireIdentity.gradientEnd));
            }).dimensions(x, y + 87, 250, 22).build());
            addDrawableChild(ButtonWidget.builder(Text.literal("Font: " + VampireIdentity.fontPreset + " (presets planned)"), button ->
                button.setMessage(Text.literal("Font presets are not wired yet")))
                .dimensions(x, y + 116, 250, 22).build());
            addDrawableChild(ButtonWidget.builder(Text.literal("Back"), button ->
                client.setScreen(new VampireQuickMenuScreen())).dimensions(x, y + 145, 250, 22).build());
        }
        private static Text chatLabel() { return Text.literal("Chat name gradient: " + (VampireIdentity.chatGradientEnabled ? "ON" : "OFF")); }
        private static Text nametagLabel() { return Text.literal("Nametag gradient: " + (VampireIdentity.nametagGradientEnabled ? "ON" : "OFF")); }
        private static Text badgeLabel() { return Text.literal("Vampire badge: " + (VampireIdentity.showClientBadge ? "ON" : "OFF")); }
        @Override public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
            renderBackground(context, mouseX, mouseY, delta);
            drawPanel(width, height, textRenderer, context, "IDENTITY & CHAT STYLING");
            context.drawCenteredTextWithShadow(textRenderer,
                VampireIdentity.gradientText("Vampire Client  ·  Afzal"),
                width / 2, height / 2 - 91, 0xFFFFFFFF);
            super.render(context, mouseX, mouseY, delta);
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
            addDrawableChild(ButtonWidget.builder(Text.literal("Back"), button ->
                client.setScreen(new VampireQuickMenuScreen()))
                .dimensions(width / 2 - 75, height / 2 + 34, 150, 22).build());
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
