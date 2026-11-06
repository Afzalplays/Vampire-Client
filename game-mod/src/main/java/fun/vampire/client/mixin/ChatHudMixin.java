package fun.vampire.client.mixin;

import fun.vampire.client.VampireIdentity;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.hud.ChatHud;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(ChatHud.class)
abstract class ChatHudMixin {
    @ModifyVariable(
        method = "addMessage(Lnet/minecraft/text/Text;)V",
        at = @At("HEAD"),
        argsOnly = true
    )
    private Text vampire$styleOwnUnsignedChatName(Text message) {
        return vampire$styleOwnChatName(message);
    }

    @ModifyVariable(
        method = "addMessage(Lnet/minecraft/text/Text;Lnet/minecraft/network/message/MessageSignatureData;Lnet/minecraft/client/gui/hud/MessageIndicator;)V",
        at = @At("HEAD"),
        argsOnly = true
    )
    private Text vampire$styleOwnSignedChatName(Text message) {
        return vampire$styleOwnChatName(message);
    }

    private Text vampire$styleOwnChatName(Text message) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (message == null || client.player == null) return message;

        String username = client.player.getName().getString();
        String plain = message.getString();
        String bracketPrefix = "<" + username + "> ";
        String colonPrefix = username + ": ";
        String delimiter;
        String body;

        if (plain.startsWith(bracketPrefix)) {
            delimiter = "<";
            body = plain.substring(bracketPrefix.length());
        } else if (plain.startsWith(colonPrefix)) {
            delimiter = "";
            body = plain.substring(colonPrefix.length());
        } else {
            return message;
        }

        if (!VampireIdentity.chatGradientEnabled && !VampireIdentity.showClientBadge
            && "Minecraft Default".equals(VampireIdentity.fontPreset)) {
            return message;
        }

        MutableText styled = Text.empty();
        if (VampireIdentity.showClientBadge) {
            styled.append(Text.literal("✦ ").formatted(Formatting.LIGHT_PURPLE));
        }
        if (!delimiter.isEmpty()) styled.append(Text.literal(delimiter));
        styled.append(VampireIdentity.styledName(username));
        styled.append(Text.literal(delimiter.isEmpty() ? ": " : "> "));
        styled.append(Text.literal(body));
        return styled;
    }
}
