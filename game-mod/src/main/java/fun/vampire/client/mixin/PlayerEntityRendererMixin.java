package fun.vampire.client.mixin;

import fun.vampire.client.VampireIdentity;
import net.minecraft.text.Text;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** Applies the local player's configured gradient to rendered player nameplates on this client. */
@Mixin(net.minecraft.client.render.entity.PlayerEntityRenderer.class)
abstract class PlayerEntityRendererMixin {
    @ModifyVariable(
        method = "renderLabelIfPresent(Lnet/minecraft/client/network/AbstractClientPlayerEntity;Lnet/minecraft/text/Text;Lnet/minecraft/client/util/math/MatrixStack;Lnet/minecraft/client/render/VertexConsumerProvider;I)V",
        at = @At("HEAD"),
        argsOnly = true,
        ordinal = 0
    )
    private Text vampire$gradientNameplate(Text original) {
        if (!VampireIdentity.nametagGradientEnabled) return original;
        return VampireIdentity.gradientText(original);
    }
}
