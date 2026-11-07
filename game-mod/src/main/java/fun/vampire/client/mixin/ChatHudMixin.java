package fun.vampire.client.mixin;

import fun.vampire.client.VampireIdentity;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.hud.ChatHud;
import net.minecraft.text.MutableText;
import net.minecraft.text.Style;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

import java.util.Optional;

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
        String prefix;
        String delimiter;

        if (plain.startsWith(bracketPrefix)) {
            prefix = bracketPrefix;
            delimiter = "<";
        } else if (plain.startsWith(colonPrefix)) {
            prefix = colonPrefix;
            delimiter = "";
        } else {
            return message;
        }

        if (!VampireIdentity.chatGradientEnabled && !VampireIdentity.showClientBadge
            && "Minecraft Default".equals(VampireIdentity.fontPreset)) {
            return message;
        }

        MutableText styled = Text.empty();
        if (VampireIdentity.showClientBadge) {
            styled.append(Text.literal("\uE000 ").setStyle(
                Style.EMPTY.withFont(Identifier.of("vampireclient", "badge"))
            ));
        }
        if (!delimiter.isEmpty()) styled.append(Text.literal(delimiter));
        styled.append(VampireIdentity.styledName(username));
        styled.append(Text.literal(delimiter.isEmpty() ? ": " : "> "));

        // Visit the original Text tree and remove only the visible username prefix.
        // Re-appending each remaining segment with its effective Style retains
        // formatting, click/hover events, insertion text and custom fonts.
        int[] remainingPrefix = {prefix.length()};
        MutableText body = Text.empty();
        message.visit((style, segment) -> {
            int skip = Math.min(remainingPrefix[0], segment.length());
            remainingPrefix[0] -= skip;
            if (skip < segment.length()) {
                body.append(Text.literal(segment.substring(skip)).setStyle(style));
            }
            return Optional.empty();
        }, Style.EMPTY);

        if (remainingPrefix[0] != 0) return message;
        styled.append(body);
        return styled;
    }
}
