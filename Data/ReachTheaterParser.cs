using System.Text;

namespace MCCTheatreBrowser.Data;

public static class ReachTheaterParser
{
    private const int TitleOffset = 0x00C0;
    private const int SessionOffset = 0x03D8;
    private const int LegacyScenarioOffset = 0x092C;
    private const int LegacyPlayerOffset = 0x0BD0;
    private const int HeaderPlayerAsciiOffset = 0x0088;
    private const string ScenarioMarker = "haloreach\\maps\\";

    public sealed class LightMeta
    {
        public string? Title { get; set; }
        public string? SessionName { get; set; }
        public string? ScenarioPathOrUgcUrl { get; set; }
        public string? PlayerName { get; set; }
        public string? LayoutVariant { get; set; }
        public int? ScenarioOffset { get; set; }
    }

    public static LightMeta ParseLight(ReadOnlySpan<byte> bytes)
    {
        var legacyScenario = Clean(ReadAsciiz(bytes, LegacyScenarioOffset));
        var resolvedScenarioOffset = IsLikelyScenario(legacyScenario)
            ? LegacyScenarioOffset
            : FindAsciizByPrefix(bytes, ScenarioMarker);

        var scenario = resolvedScenarioOffset >= 0
            ? Clean(ReadAsciiz(bytes, resolvedScenarioOffset))
            : legacyScenario;

        var player = Clean(ReadUtf16z(bytes, LegacyPlayerOffset));
        if (!IsLikelyPlayer(player))
            player = Clean(ReadAsciiz(bytes, HeaderPlayerAsciiOffset));
        player = NormalizePlayerName(player);

        return new LightMeta
        {
            Title = Clean(ReadUtf16z(bytes, TitleOffset)),
            SessionName = Clean(ReadAsciiz(bytes, SessionOffset)),
            ScenarioPathOrUgcUrl = scenario,
            PlayerName = player,
            LayoutVariant = GetLayoutVariant(resolvedScenarioOffset),
            ScenarioOffset = resolvedScenarioOffset >= 0 ? resolvedScenarioOffset : null
        };
    }

    public static string DetectLayoutVariant(ReadOnlySpan<byte> bytes)
    {
        var legacyScenario = Clean(ReadAsciiz(bytes, LegacyScenarioOffset));
        if (IsLikelyScenario(legacyScenario))
            return "legacy";

        var dynamicScenarioOffset = FindAsciizByPrefix(bytes, ScenarioMarker);
        return GetLayoutVariant(dynamicScenarioOffset);
    }

    public static string? StripSessionPii(string? sessionName, string replacement = "HALO@RUNS")
    {
        if (string.IsNullOrWhiteSpace(sessionName))
            return sessionName;

        var firstAt = sessionName.IndexOf('@');
        if (firstAt < 0)
            return sessionName;

        var secondAt = sessionName.IndexOf('@', firstAt + 1);
        if (secondAt < 0)
            return sessionName;

        return sessionName[..(secondAt + 1)] + replacement;
    }

    private static string? ReadAsciiz(ReadOnlySpan<byte> bytes, int offset)
    {
        if (offset < 0 || offset >= bytes.Length)
            return null;

        var end = offset;
        while (end < bytes.Length && bytes[end] != 0)
            end++;

        return Encoding.ASCII.GetString(bytes.Slice(offset, end - offset));
    }

    private static string? ReadUtf16z(ReadOnlySpan<byte> bytes, int offset)
    {
        if (offset < 0 || offset + 1 >= bytes.Length)
            return null;

        var end = offset;
        while (end + 1 < bytes.Length)
        {
            if (bytes[end] == 0 && bytes[end + 1] == 0)
                break;
            end += 2;
        }

        if (end <= offset)
            return string.Empty;

        return Encoding.Unicode.GetString(bytes.Slice(offset, end - offset));
    }

    private static string? Clean(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        return value;
    }

    private static bool IsLikelyScenario(string? value) =>
        !string.IsNullOrWhiteSpace(value) &&
        value.StartsWith(ScenarioMarker, StringComparison.OrdinalIgnoreCase);

    private static bool IsLikelyPlayer(string? value) =>
        !string.IsNullOrWhiteSpace(value) && value.Length >= 2;

    private static string? NormalizePlayerName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return value;

        var trimmed = value.Trim();
        if (trimmed.Length >= 5 &&
            (trimmed.StartsWith("I ", StringComparison.Ordinal) || trimmed.StartsWith("| ", StringComparison.Ordinal)) &&
            (trimmed.EndsWith(" I", StringComparison.Ordinal) || trimmed.EndsWith(" |", StringComparison.Ordinal)))
        {
            var core = trimmed[2..^2].Trim();
            return string.IsNullOrWhiteSpace(core) ? trimmed : core;
        }

        return trimmed;
    }

    private static int FindAsciizByPrefix(ReadOnlySpan<byte> bytes, string prefix)
    {
        var markerBytes = Encoding.ASCII.GetBytes(prefix);
        if (markerBytes.Length == 0 || markerBytes.Length > bytes.Length)
            return -1;

        for (var i = 0; i <= bytes.Length - markerBytes.Length; i++)
        {
            if (!bytes.Slice(i, markerBytes.Length).SequenceEqual(markerBytes))
                continue;

            var end = i;
            while (end < bytes.Length && bytes[end] != 0)
                end++;

            if (end > i)
                return i;
        }

        return -1;
    }

    private static string GetLayoutVariant(int scenarioOffset)
    {
        if (scenarioOffset < 0)
            return "unknown";

        if (scenarioOffset == LegacyScenarioOffset)
            return "legacy";

        return "extended";
    }
}
