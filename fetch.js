const core = require("@actions/core");
const { execSync } = require("child_process");
const path = require("path");
const cache = require("@actions/cache");

function parseBooleanInput(value, defaultValue = false) {
    const normalized = value.trim().toLowerCase();
    return { 'true': true, 'false': false }[normalized] ?? defaultValue;
}

async function fetchCache() {
    try {
        const paths = [];
        const restoreKeys = [];

        const mixkey = core.getInput("mixkey");
        const prefix = core.getInput("prefix");
        const cleanUpCache = parseBooleanInput(core.getInput("clean"));

        if (cleanUpCache) {
            core.info("🧹 Clean flag is set. Skipping cache restore.");
            return;
        }

        if (prefix) {
            process.chdir(prefix);
            core.debug(`Changed working directory to: ${prefix}`);
        }

        // Build base key
        let keyString = mixkey ? `${mixkey}-cache-openwrt` : "cache-openwrt";

        const cacheToolchain = parseBooleanInput(core.getInput("toolchain"), true);
        const skipBuildingToolchain = parseBooleanInput(core.getInput("skip"), true);

        // ❌ Toolchain hash is ignored for compatibility with existing caches
        // If needed later, uncomment this block
        /*
        if (cacheToolchain) {
            const toolchainHash = execSync('git log --pretty=tformat:"%h" -n1 tools toolchain')
                .toString()
                .trim();

            keyString += `-${toolchainHash}`;
            paths.push(
                path.join("staging_dir", "host*"),
                path.join("staging_dir", "tool*")
            );
        } else {
            core.debug("Skipping toolchain processing");
        }
        */

        const cacheCcache = parseBooleanInput(core.getInput("ccache"));
        if (cacheCcache) {
            restoreKeys.unshift(`${keyString}--`);  // prefix matching
            paths.push(".ccache");
        }

        // 🔍 Debug info for tracking
        core.info("📦 Cache Restore Debug Info:");
        core.info(`🗝️  Primary Key: ${keyString}`);
        core.info(`🔑 Restore Keys: ${JSON.stringify(restoreKeys)}`);
        core.info(`📁 Paths: ${paths.join(", ")}`);
        core.info(`📂 Current Working Directory: ${process.cwd()}`);

        const result = await cache.restoreCache(paths, keyString, restoreKeys);

        if (result) {
            core.info(`✅ Cache hit: ${result}`);
            core.setOutput("hit", "1");
            core.saveState("CACHE_STATE", "hit");

            // Optional toolchain patching
            if (skipBuildingToolchain) {
                try {
                    execSync("sed -i 's/ $(tool.*\\/stamp-compile)//;' Makefile");
                    execSync("sed -i 's/ $(tool.*\\/stamp-install)//;' Makefile");
                    core.info("🔧 Toolchain building skipped (Makefile patched).");
                } catch (err) {
                    core.warning("⚠️ Failed to patch Makefile to skip toolchain.");
                }
            }
        } else {
            core.info("❌ No cache hit. Possible causes:");
            core.info("- 🔑 Key mismatch (check if key format changed)");
            core.info("- 📁 Path mismatch (verify 'paths' are identical to save step)");
            core.info("- 🧹 Cache expired or manually deleted");
            core.info("- 📦 Cache was created in a different repo/branch/environment");
        }
    } catch (error) {
        core.setFailed(`💥 Cache restore failed: ${error.message}`);
        process.exit(1);
    }
}

fetchCache();
