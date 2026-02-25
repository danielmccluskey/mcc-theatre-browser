window.theaterFs = (() => {
    let rootHandle = null;
    let fallbackFileMap = null;
    let fallbackGames = null;
    let fallbackRootName = null;
    let fallbackAllFiles = null;
    const handleDbName = "mcc-theatre-browser";
    const handleStoreName = "handles";
    const handleKey = "userContent";
    const theaterExtensions = [".mov", ".blf", ".film"];

    function isTheaterFile(name) {
        const lower = name.toLowerCase();
        return theaterExtensions.some(ext => lower.endsWith(ext));
    }

    function canUseDirectoryInput() {
        const input = document.createElement("input");
        return "webkitdirectory" in input;
    }

    function requireZipJs() {
        if (!window.zip || !window.zip.ZipWriter || !window.zip.BlobWriter) {
            throw new Error("Zip library failed to load. Refresh and try again.");
        }
        return window.zip;
    }

    function triggerDownload(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    async function openHandleDb() {
        return await new Promise((resolve, reject) => {
            const req = indexedDB.open(handleDbName, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(handleStoreName)) {
                    db.createObjectStore(handleStoreName);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
        });
    }

    async function deleteHandleDb() {
        return await new Promise((resolve) => {
            const req = indexedDB.deleteDatabase(handleDbName);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
            req.onblocked = () => resolve(false);
        });
    }

    async function saveHandle(handle) {
        try {
            const db = await openHandleDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(handleStoreName, "readwrite");
                tx.objectStore(handleStoreName).put(handle, handleKey);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error("Save handle failed"));
            });
            db.close();
        } catch {
            // ignore, app still works without persistence
        }
    }

    async function loadHandle() {
        try {
            const db = await openHandleDb();
            const handle = await new Promise((resolve, reject) => {
                const tx = db.transaction(handleStoreName, "readonly");
                const req = tx.objectStore(handleStoreName).get(handleKey);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error || new Error("Load handle failed"));
            });
            db.close();
            return handle;
        } catch {
            return null;
        }
    }

    async function walkDir(dirHandle, relativePath = "") {
        const files = [];

        for await (const [name, handle] of dirHandle.entries()) {
            const nextPath = relativePath ? `${relativePath}/${name}` : name;

            if (handle.kind === "file" && isTheaterFile(name)) {
                files.push(nextPath);
            }

            if (handle.kind === "directory") {
                const nested = await walkDir(handle, nextPath);
                files.push(...nested);
            }
        }

        return files;
    }

    async function openFile(gameName, relativePath) {
        if (fallbackFileMap) {
            const key = `${gameName}|${relativePath}`;
            const file = fallbackFileMap.get(key);
            if (!file) throw new Error("File not found.");
            return file;
        }

        if (!rootHandle) throw new Error("No folder selected.");

        const gameHandle = await rootHandle.getDirectoryHandle(gameName);
        const parts = relativePath.split("/").filter(Boolean);
        if (parts.length === 0) throw new Error("Bad file path.");

        let dir = gameHandle;
        for (let i = 0; i < parts.length - 1; i++) {
            dir = await dir.getDirectoryHandle(parts[i]);
        }

        const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
        return await fileHandle.getFile();
    }

    function mapFallbackFiles(fileList) {
        const gameMap = new Map();
        const fileMap = new Map();
        const allMap = new Map();

        for (const file of fileList) {
            const rel = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
            const parts = rel.split("/").filter(Boolean);
            if (parts.length === 0) continue;

            let start = 0;
            if (fallbackRootName && parts[0] === fallbackRootName) start = 1;
            if (parts.length - start < 2) continue;

            const gameName = parts[start];
            const relativePath = parts.slice(start + 1).join("/");
            const fullRelativePath = parts.slice(start).join("/");
            if (fullRelativePath) {
                allMap.set(fullRelativePath, file);
            }
            if (!relativePath || !isTheaterFile(relativePath)) continue;

            const key = `${gameName}|${relativePath}`;
            fileMap.set(key, file);

            if (!gameMap.has(gameName)) {
                gameMap.set(gameName, { gameName, files: [] });
            }

            gameMap.get(gameName).files.push(relativePath);
        }

        const games = Array.from(gameMap.values());
        for (const g of games) g.files.sort((a, b) => a.localeCompare(b));
        games.sort((a, b) => a.gameName.localeCompare(b.gameName));

        fallbackFileMap = fileMap;
        fallbackGames = games;
        fallbackAllFiles = allMap;
        rootHandle = null;
    }

    async function pickFolderViaInput() {
        return await new Promise((resolve, reject) => {
            const input = document.createElement("input");
            input.type = "file";
            input.multiple = true;
            input.setAttribute("webkitdirectory", "");
            input.style.display = "none";
            document.body.appendChild(input);

            input.addEventListener("change", () => {
                try {
                    const files = Array.from(input.files || []);
                    if (files.length === 0) {
                        document.body.removeChild(input);
                        reject(new Error("No folder selected."));
                        return;
                    }

                    const rel = files[0].webkitRelativePath || "";
                    fallbackRootName = rel.split("/")[0] || "selected-folder";
                    mapFallbackFiles(files);
                    document.body.removeChild(input);
                    resolve({ folderName: fallbackRootName });
                } catch (err) {
                    document.body.removeChild(input);
                    reject(err);
                }
            }, { once: true });

            input.click();
        });
    }

    return {
        isSupported: () => typeof window.showDirectoryPicker === "function" || canUseDirectoryInput(),

        async copyText(text) {
            if (!text) return false;

            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }

            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(textarea);
            return ok;
        },

        async pickUserContentFolder() {
            fallbackFileMap = null;
            fallbackGames = null;
            fallbackRootName = null;
            fallbackAllFiles = null;

            if (typeof window.showDirectoryPicker === "function") {
                rootHandle = await window.showDirectoryPicker({ mode: "read" });
                // save in background so picker flow does not feel stuck
                saveHandle(rootHandle);
                return { folderName: rootHandle.name };
            }

            if (canUseDirectoryInput()) {
                return await pickFolderViaInput();
            }

            throw new Error("No supported folder access method in this browser.");
        },

        async tryRestoreSavedFolder(autoRequestPermission) {
            fallbackFileMap = null;
            fallbackGames = null;
            fallbackRootName = null;
            fallbackAllFiles = null;

            if (typeof window.showDirectoryPicker !== "function") {
                return { restored: false, reason: "picker-not-supported" };
            }

            const savedHandle = await loadHandle();
            if (!savedHandle) {
                return { restored: false, reason: "no-saved-handle" };
            }

            let permission = await savedHandle.queryPermission({ mode: "read" });
            if (permission !== "granted" && autoRequestPermission) {
                permission = await savedHandle.requestPermission({ mode: "read" });
            }

            if (permission === "granted") {
                rootHandle = savedHandle;
                return { restored: true, folderName: rootHandle.name };
            }

            return {
                restored: false,
                reason: "permission-not-granted",
                folderName: savedHandle.name || "saved-folder"
            };
        },

        async refreshGameFiles() {
            if (fallbackGames) return fallbackGames;
            if (!rootHandle) throw new Error("No folder selected.");
            const games = [];

            for await (const [name, handle] of rootHandle.entries()) {
                if (handle.kind !== "directory") continue;

                const files = await walkDir(handle);
                games.push({
                    gameName: name,
                    files: files.sort((a, b) => a.localeCompare(b))
                });
            }

            games.sort((a, b) => a.gameName.localeCompare(b.gameName));
            return games;
        },

        async readFilePrefixBytes(gameName, relativePath, maxBytes) {
            const file = await openFile(gameName, relativePath);
            const slice = file.slice(0, Math.max(0, maxBytes ?? 0));
            const buffer = await slice.arrayBuffer();
            const bytes = Array.from(new Uint8Array(buffer));

            return {
                name: file.name,
                size: file.size,
                lastModified: file.lastModified,
                bytes: bytes
            };
        },

        async buildZipAndDownload(zipName, entries, metaJsonText) {
            const zipJs = requireZipJs();
            const writer = new zipJs.ZipWriter(new zipJs.BlobWriter("application/zip"));

            for (const e of entries || []) {
                const zipPath = `${e.gameName}/${e.relativePath}`.replace(/\\/g, "/");
                const file = await openFile(e.gameName, e.relativePath);
                await writer.add(zipPath, new zipJs.BlobReader(file), { level: 0 });
            }

            await writer.add("meta.json", new zipJs.TextReader(metaJsonText || "{}"), { level: 0 });

            const blob = await writer.close();
            triggerDownload(blob, zipName || "archive.zip");
        },

        async backupWholeFolderZip(zipName) {
            const zipJs = requireZipJs();
            const writer = new zipJs.ZipWriter(new zipJs.BlobWriter("application/zip"));

            const addFileToZip = async (relativePath, file) => {
                const cleanPath = relativePath.replace(/\\/g, "/");
                await writer.add(cleanPath, new zipJs.BlobReader(file), { level: 0 });
            };

            if (fallbackAllFiles && fallbackAllFiles.size > 0) {
                for (const [relativePath, file] of fallbackAllFiles.entries()) {
                    await addFileToZip(relativePath, file);
                }
            } else {
                if (!rootHandle) {
                    throw new Error("No folder selected.");
                }

                const walkAll = async (dirHandle, prefix = "") => {
                    for await (const [name, handle] of dirHandle.entries()) {
                        const nextPath = prefix ? `${prefix}/${name}` : name;
                        if (handle.kind === "file") {
                            const file = await handle.getFile();
                            await addFileToZip(nextPath, file);
                        } else if (handle.kind === "directory") {
                            await walkAll(handle, nextPath);
                        }
                    }
                };

                await walkAll(rootHandle);
            }

            const blob = await writer.close();
            triggerDownload(blob, zipName || "backup.zip");
        },

        async clearSavedDataAndReload() {
            // in-memory reset
            rootHandle = null;
            fallbackFileMap = null;
            fallbackGames = null;
            fallbackRootName = null;
            fallbackAllFiles = null;

            // browser storage reset for this origin
            try { localStorage.clear(); } catch {}
            try { sessionStorage.clear(); } catch {}
            try { await deleteHandleDb(); } catch {}

            location.reload();
        },

        async clearCurrentFolderSelection() {
            rootHandle = null;
            fallbackFileMap = null;
            fallbackGames = null;
            fallbackRootName = null;
            fallbackAllFiles = null;
            await deleteHandleDb();
        }
    };
})();
