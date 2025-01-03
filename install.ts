import { nodeFileTrace } from "@vercel/nft";
import fs from "fs/promises";
import path from "path";

// Get command-line arguments
const [serverFile, targetDir] = process.argv.slice(2);

if (!serverFile || !targetDir) {
    console.error("Usage: node --import=@swc-node/register/esm-register install.ts <server-file> <target-directory>");
    process.exit(1);
}

(async () => {
    try {
        // Trace dependencies of the provided file
        const { fileList } = await nodeFileTrace([serverFile],
            { conditions: ['node', 'production'] });

        // Resolve absolute paths to avoid nested copying
        const targetDirAbsolute = path.resolve(targetDir);

        // Copy each file to the target directory with its nested structure
        for (const filePath of fileList) {
            const targetPath = path.join(targetDir, filePath);

            // Get the absolute path of the source file
            const sourcePathAbsolute = path.resolve(filePath);

            // Check if the file is already in the target directory
            if (sourcePathAbsolute.startsWith(targetDirAbsolute)) {
                console.log(`Skipping ${ filePath } as it is already within the target directory.`);
                continue;
            }

            // Create necessary directories
            await fs.mkdir(path.dirname(targetPath), { recursive: true });

            // Copy the file
            await fs.copyFile(filePath, targetPath);
            console.log(`Copied ${ filePath } to ${ targetPath }`);
        }

        console.log("All files copied successfully.");
    } catch (err) {
        console.error("Error:", err);
    }
})();
