// 引入 GitHub Actions 核心模块（用于读写输入、输出、状态等）
const core = require("@actions/core");

// Node.js 子进程模块，用于执行 shell 命令（如 git log、sed、date）
const { execSync } = require("child_process");

// Node.js 路径模块，用于拼接路径
const path = require("path");

// GitHub 官方缓存模块
const cache = require("@actions/cache");

/**
 * 将字符串形式的布尔值（"true"/"false"）转换为布尔类型
 * @param value 输入值
 * @param defaultValue 默认值（未识别时使用）
 * @returns boolean 值
 */
function parseBooleanInput(value, defaultValue = false) {
    const normalized = value.trim().toLowerCase();
    return { 'true': true, 'false': false }[normalized] ?? defaultValue;
}

// 主函数：恢复缓存
async function fetchCache() {
    try {
        const paths = [];        // 要恢复缓存的路径列表
        const restoreKeys = [];  // 用于模糊匹配的备用 key 列表

        // 读取传入的参数
        const mixkey = core.getInput("mixkey");     // 自定义 key，用于区分架构/平台
        const prefix = core.getInput("prefix");     // 构建目录前缀（例如 openwrt）
        const cleanUpCache = parseBooleanInput(core.getInput("clean")); // 是否强制跳过恢复缓存

        // 如果设置了 clean=true，就不进行缓存恢复
        if (cleanUpCache) return;

        // 切换到源码目录（prefix），方便后续路径操作
        if (prefix) {
            process.chdir(prefix);
            core.debug(`Changed working directory to: ${prefix}`);
        }

        // 构造缓存 key 的基础部分
        const baseKey = mixkey ? `${mixkey}-cache-openwrt` : "cache-openwrt";

        // 是否恢复工具链缓存
        const cacheToolchain = parseBooleanInput(core.getInput("toolchain"), true);

        // 是否跳过工具链编译
        const skipBuildingToolchain = parseBooleanInput(core.getInput("skip"), true);

        // 备选Key1：包含 toolchainHash
        let keyWithToolchainHash = baseKey;

        if (cacheToolchain) {
            // 获取 tools 和 toolchain 子目录的最近一次 git 提交 hash，确保 key 跟代码变动绑定
            const toolchainHash = execSync('git log --pretty=tformat:"%h" -n1 tools toolchain')
                .toString()
                .trim();

            keyWithToolchainHash = `${baseKey}-${toolchainHash}`;

            // 添加工具链缓存目录路径
            paths.push(
                path.join("staging_dir", "host*"), // host 工具目录
                path.join("staging_dir", "tool*")  // tool 工具目录
            );
        } else {
            core.debug("Skipping toolchain processing");
        }

        // 是否恢复 ccache 缓存
        const cacheCcache = parseBooleanInput(core.getInput("ccache"));

        // 主 Key（含时间戳）
        let mainKey = keyWithToolchainHash;

        if (cacheCcache) {
            const timestamp = execSync("date +%s").toString().trim();

            // 主 Key：带时间戳，优先级最高
            mainKey = `${keyWithToolchainHash}-${timestamp}`;

            // 备选 keys 顺序：[keyWithToolchainHash, baseKey]
            restoreKeys.push(keyWithToolchainHash);
            restoreKeys.push(baseKey);

            // 添加 ccache 缓存路径
            paths.push(".ccache");
        } else {
            // 如果没有 ccache，则主 key 就是 keyWithToolchainHash
            // 备选 key 是 baseKey
            restoreKeys.push(baseKey);
        }

        core.debug(`Cache paths: ${paths.join(", ")}`);
        console.log(mainKey, restoreKeys);

        // 执行缓存恢复
        const cacheFetchingResult = await cache.restoreCache(paths, mainKey, restoreKeys);

        if (cacheFetchingResult) {
            core.info(`${cacheFetchingResult} cache fetched!`);
            core.setOutput("hit", "1");
            core.saveState("CACHE_STATE", "hit");

            // 如果允许跳过工具链编译，就通过 sed 注释掉 Makefile 中的编译/安装依赖
            if (cacheToolchain && skipBuildingToolchain) {
                execSync("sed -i 's/ $(tool.*\\/stamp-compile)//;' Makefile");
                execSync("sed -i 's/ $(tool.*\\/stamp-install)//;' Makefile");
                core.info("Toolchain building skipped");
            }
        }
    } catch (error) {
        // 如果恢复缓存出错，构建失败并退出
        core.setFailed(error.message);
        process.exit(1);
    }
}

// 执行缓存恢复主函数
fetchCache();