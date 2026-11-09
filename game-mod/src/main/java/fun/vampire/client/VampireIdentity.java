package fun.vampire.client;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.text.MutableText;
import net.minecraft.text.Style;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

/**
 * Local identity styling preferences and gradient text utilities.
 *
 * These preferences are client-local. They do not announce client usage to
 * remote players or change what an unmodified client renders.
 */
public final class VampireIdentity {
    private static final Path CONFIG = FabricLoader.getInstance().getConfigDir()
        .resolve("vampire-identity.properties");

    public static boolean chatGradientEnabled = true;
    public static boolean nametagGradientEnabled = true;
    public static boolean showClientBadge = true;
    public static String gradientStart = "#FF526F";
    public static String gradientEnd = "#9B5CFF";
    public static String fontPreset = "Minecraft Default";

    private VampireIdentity() {}

    public static void load() {
        Properties p = new Properties();
        if (!Files.exists(CONFIG)) return;
        try (InputStream in = Files.newInputStream(CONFIG)) {
            p.load(in);
            chatGradientEnabled = Boolean.parseBoolean(p.getProperty("chat.gradient", "true"));
            nametagGradientEnabled = Boolean.parseBoolean(p.getProperty("nametag.gradient", "true"));
            showClientBadge = Boolean.parseBoolean(p.getProperty("badge.visible", "true"));
            gradientStart = normalizeHex(p.getProperty("gradient.start", "#FF526F"));
            gradientEnd = normalizeHex(p.getProperty("gradient.end", "#9B5CFF"));
            fontPreset = normalizeFont(p.getProperty("font.preset", "Minecraft Default"));
        } catch (Exception ignored) {
            // Keep safe defaults if the local preferences file is malformed.
        }
    }

    public static void save() {
        Properties p = new Properties();
        p.setProperty("chat.gradient", Boolean.toString(chatGradientEnabled));
        p.setProperty("nametag.gradient", Boolean.toString(nametagGradientEnabled));
        p.setProperty("badge.visible", Boolean.toString(showClientBadge));
        p.setProperty("gradient.start", normalizeHex(gradientStart));
        p.setProperty("gradient.end", normalizeHex(gradientEnd));
        p.setProperty("font.preset", normalizeFont(fontPreset));
        try {
            Files.createDirectories(CONFIG.getParent());
            try (OutputStream out = Files.newOutputStream(CONFIG)) {
                p.store(out, "Vampire Client identity preferences");
            }
        } catch (Exception ignored) {
            // The current session still uses the in-memory preferences.
        }
    }

    public static MutableText styledName(String value) {
        if (chatGradientEnabled) return gradientText(value);
        MutableText text = Text.literal(value == null ? "" : value);
        Identifier font = selectedFont();
        if (font != null) text.setStyle(Style.EMPTY.withFont(font));
        return text;
    }

    public static MutableText gradientText(Text original) {
        if (original == null) return Text.empty();
        String full = original.getString();
        int total = full.length();
        int[] index = {0};
        int start = parseHex(gradientStart, 0xFFFF526F);
        int end = parseHex(gradientEnd, 0xFF9B5CFF);
        MutableText result = Text.empty();
        original.visit((style, segment) -> {
            for (int i = 0; i < segment.length(); i++) {
                float t = total <= 1 ? 0f : (float) index[0] / (total - 1);
                int color = interpolate(start, end, t);
                result.append(Text.literal(segment.substring(i, i + 1)).setStyle(style.withColor(color)));
                index[0]++;
            }
            return Optional.empty();
        }, Style.EMPTY);
        return result;
    }

    public static MutableText gradientText(String value) {
        String input = value == null ? "" : value;
        int start = parseHex(gradientStart, 0xFFFF526F);
        int end = parseHex(gradientEnd, 0xFF9B5CFF);
        MutableText result = Text.empty();
        int count = Math.max(1, input.length());
        for (int i = 0; i < input.length(); i++) {
            float t = count == 1 ? 0f : (float) i / (count - 1);
            int color = interpolate(start, end, t);
            Style style = Style.EMPTY.withColor(color);
            Identifier font = selectedFont();
            if (font != null) style = style.withFont(font);
            result.append(Text.literal(String.valueOf(input.charAt(i))).setStyle(style));
        }
        return result;
    }

    public static String nextFontPreset() {
        fontPreset = switch (normalizeFont(fontPreset)) {
            case "Minecraft Uniform" -> "Minecraft Alt";
            case "Minecraft Alt" -> "Minecraft Default";
            default -> "Minecraft Uniform";
        };
        save();
        return fontPreset;
    }

    private static Identifier selectedFont() {
        return switch (normalizeFont(fontPreset)) {
            case "Minecraft Uniform" -> Identifier.of("minecraft", "uniform");
            case "Minecraft Alt" -> Identifier.of("minecraft", "alt");
            default -> null;
        };
    }

    private static String normalizeFont(String value) {
        if ("Minecraft Uniform".equals(value)) return "Minecraft Uniform";
        if ("Minecraft Alt".equals(value)) return "Minecraft Alt";
        return "Minecraft Default";
    }

    public static String normalizeHex(String value) {
        if (value == null) return "#FF526F";
        String hex = value.trim().toUpperCase();
        if (hex.matches("#[0-9A-F]{6}")) return hex;
        if (hex.matches("[0-9A-F]{6}")) return "#" + hex;
        return "#FF526F";
    }

    private static int parseHex(String value, int fallback) {
        try {
            return Integer.parseInt(normalizeHex(value).substring(1), 16);
        } catch (RuntimeException ex) {
            return fallback;
        }
    }

    private static int interpolate(int a, int b, float t) {
        int ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
        int br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
        int r = Math.round(ar + (br - ar) * t);
        int g = Math.round(ag + (bg - ag) * t);
        int bl = Math.round(ab + (bb - ab) * t);
        return (r << 16) | (g << 8) | bl;
    }
}
