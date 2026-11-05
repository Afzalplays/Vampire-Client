package fun.vampire.client;

import java.util.Comparator;
import java.util.List;

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

    @Override
    public void onInitializeClient() {
        openMenu = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key.vampireclient.open_menu",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_RIGHT_SHIFT,
            "category.vampireclient"
        ));

        HudRenderCallback.EVENT.register((drawContext, tickCounter) -> {
            if (!showFpsHud) return;
            MinecraftClient client = MinecraftClient.getInstance();
            drawContext.fill(8, 8, 174, 29, 0xB8101018);
            drawContext.fill(8, 8, 10, 29, 0xFFFF596F);
            drawContext.drawTextWithShadow(client.textRenderer,
                "VAMPIRE  |  " + client.getCurrentFps() + " FPS", 16, 14, 0xFFFF8290);
        });

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (openMenu.wasPressed()) {
                if (client.currentScreen == null) client.setScreen(new VampireQuickMenuScreen());
                else if (client.currentScreen instanceof VampireQuickMenuScreen) client.setScreen(null);
            }
        });
    }

    private static void drawPanel(Screen screen, net.minecraft.client.gui.DrawContext context, String title) {
        context.fill(0, 0, screen.width, screen.height, 0x55040008);
        context.fill(screen.width / 2 - 190, screen.height / 2 - 130,
            screen.width / 2 + 190, screen.height / 2 + 130, 0xE8101018);
        context.fill(screen.width / 2 - 190, screen.height / 2 - 130,
            screen.width / 2 + 190, screen.height / 2 - 128, 0xFFFF596F);
        context.drawCenteredTextWithShadow(screen.textRenderer, "VAMPIRE STUDIOS",
            screen.width / 2, screen.height / 2 - 116, 0xFFFF7182);
        context.drawCenteredTextWithShadow(screen.textRenderer, title,
            screen.width / 2, screen.height / 2 - 96, 0xFFFFFFFF);
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
            addDrawableChild(ButtonWidget.builder(Text.literal("Close"), button -> close())
                .dimensions(center - 100, top + 93, 200, 24).build());
        }

        @Override
        public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
            renderBackground(context, mouseX, mouseY, delta);
            drawPanel(this, context, "QUICK MENU");
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
            drawPanel(this, context, "LOADED MODS  ·  " + mods.size());
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
            addDrawableChild(ButtonWidget.builder(Text.literal("Back"), button ->
                client.setScreen(new VampireQuickMenuScreen()))
                .dimensions(width / 2 - 75, height / 2 + 70, 150, 22).build());
        }
        @Override public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
            renderBackground(context, mouseX, mouseY, delta);
            drawPanel(this, context, "PERFORMANCE");
            Runtime runtime = Runtime.getRuntime();
            long used = (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024);
            context.drawCenteredTextWithShadow(textRenderer, "Current FPS: " + client.getCurrentFps(),
                width / 2, height / 2 - 45, 0xFFFFFFFF);
            context.drawCenteredTextWithShadow(textRenderer, "Java memory in use: " + used + " MB",
                width / 2, height / 2 - 25, 0xFFD8C5CC);
            context.drawCenteredTextWithShadow(textRenderer, "Use Vampire Client Settings to change allocated RAM.",
                width / 2, height / 2 + 5, 0xFFB49EA7);
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
                button.setMessage(fpsLabel());
            }).dimensions(width / 2 - 105, height / 2 - 12, 210, 24).build());
            addDrawableChild(ButtonWidget.builder(Text.literal("Back"), button ->
                client.setScreen(new VampireQuickMenuScreen()))
                .dimensions(width / 2 - 75, height / 2 + 28, 150, 22).build());
        }
        private static Text fpsLabel() { return Text.literal("FPS HUD: " + (showFpsHud ? "ON" : "OFF")); }
        @Override public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
            renderBackground(context, mouseX, mouseY, delta);
            drawPanel(this, context, "HUD & SETTINGS");
            super.render(context, mouseX, mouseY, delta);
        }
        @Override public boolean shouldPause() { return false; }
    }
}
