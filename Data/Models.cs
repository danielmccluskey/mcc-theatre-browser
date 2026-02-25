namespace MCCTheatreBrowser.Data;

public sealed class PickResult
{
    public string FolderName { get; set; } = string.Empty;
}

public sealed class RestoreResult
{
    public bool Restored { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string FolderName { get; set; } = string.Empty;
}

public sealed class GameFolderRow
{
    public string GameName { get; set; } = string.Empty;
    public List<string> Files { get; set; } = [];
}

public sealed class JsFile
{
    public string Name { get; set; } = string.Empty;
    public long Size { get; set; }
    public long LastModified { get; set; }
    public List<int> Bytes { get; set; } = [];
}

public sealed class ZipEntryRequest
{
    public string GameName { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
}

public sealed class FileRow
{
    public bool IsSelected { get; set; }
    public string GameName { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
    public long Size { get; set; }
    public DateTimeOffset LastModified { get; set; }
    public string? Title { get; set; }
    public string? SessionName { get; set; }
    public string? SessionNameSafe { get; set; }
    public DateTime? SessionTime { get; set; }
    public string? ScenarioPathOrUgcUrl { get; set; }
    public string? PlayerName { get; set; }
    public string? Error { get; set; }
}

public sealed class ZipMeta
{
    public DateTimeOffset CreatedUtc { get; set; }
    public bool StripPii { get; set; }
    public int FileCount { get; set; }
    public List<ZipMetaItem> Files { get; set; } = [];
}

public sealed class ZipMetaItem
{
    public string GameName { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
    public long Size { get; set; }
    public string? SessionName { get; set; }
    public DateTime? SessionTime { get; set; }
    public string? Title { get; set; }
    public string? PlayerName { get; set; }
    public string? ScenarioPathOrUgcUrl { get; set; }
    public string? Error { get; set; }
}
