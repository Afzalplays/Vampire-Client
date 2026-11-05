package fun.vampire.client;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

public final class VampireClientMod implements ClientModInitializer {
    private KeyBinding openMenu;

    @Override
    public void onInitializeClient() {
        openMenu = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key.vampireclient.open_menu",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_RIGHT_SHIFT,
            "category.vampireclient"
        ));
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (openMenu.wasPressed()) {
                if (client.currentScreen == null) client.setScreen(new VampireQuickMenuScreen());
                else if (client.currentScreen instanceof VampireQuickMenuScreen) client.setScreen(null);
            }
        });
    }

    private static final class VampireQuickMenuScreen extends Screen {
        protected VampireQuickMenuScreen() {
            super(Text.literal("Vampire Quick Menu"));
        }

        @Override
        protected void init() {
            int center = width / 2;
            int top = height / 2 - 65;
            addDrawableChild(net.minecraft.client.gui.widget.ButtonWidget.builder(
                Text.literal("Mods"), button -> client.setScreen(new InfoScreen("Mod management is coming soon.")))
                .dimensions(center - 100, top, 200, 24).build());
            addDrawableChild(net.minecraft.client.gui.widget.ButtonWidget.builder(
                Text.literal("Performance"), button -> client.setScreen(new InfoScreen("Performance profiles are coming soon.")))
                .dimensions(center - 100, top + 32, 200, 24).build());
            addDrawableChild(net.minecraft.client.gui.widget.ButtonWidget.builder(
                Text.literal("HUD & Settings"), button -> client.setScreen(new InfoScreen("HUD editor is coming soon.")))
                .dimensions(center - 100, top + 64, 200, 24).build());
            addDrawableChild(net.minecraft.client.gui.widget.ButtonWidget.builder(
                Text.literal("Close"), button -> close()).dimensions(center - 100, top + 96, 200, 24).build());
        }

        @Override
        public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
            renderBackground(context, mouseX, mouseY, delta);
            context.fill(width / 2 - 125, height / 2 - 90, width / 2 + 125, height / 2 + 80, 0xE6101017);
            context.drawCenteredTextWithShadow(textRenderer, "VAMPIRE STUDIOS", width / 2, height / 2 - 82, 0xFFFF6478);
            super.render(context, mouseX, mouseY, delta);
        }

        @Override public boolean shouldPause() { return false; }
    }

    private static final class InfoScreen extends Screen {
        private final String message;
        protected InfoScreen(String message) { super(Text.literal("Vampire Client")); this.message = message; }
        @Override protected void init() {
            addDrawableChild(net.minecraft.client.gui.widget.ButtonWidget.builder(Text.literal("Back"), button -> client.setScreen(new VampireQuickMenuScreen()))
                .dimensions(width / 2 - 90, height / 2 + 24, 180, 24).build());
        }
        @Override public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
            renderBackground(context, mouseX, mouseY, delta);
            context.drawCenteredTextWithShadow(textRenderer, "VAMPIRE STUDIOS", width / 2, height / 2 - 24, 0xFFFF6478);
            context.drawCenteredTextWithShadow(textRenderer, message, width / 2, height / 2, 0xFFFFFFFF);
            super.render(context, mouseX, mouseY, delta);
        }
        @Override public boolean shouldPause() { return false; }
    }
}
