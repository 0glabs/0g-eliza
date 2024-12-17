export const zgsExtractFilePathTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "filePath": string,
    "rootHash": string | null
}
\`\`\`

{{recentMessages}}

Extract the user's intention to upload/download a file from the conversation. Users might express this in various ways, such as:
- "I want to upload cv.pdf from zero gravity storage"
- "upload /root/cv.pdf to zero gravity storage"
- "upload /root/cv.pdf to zgs"
- "I want to download a file with a root hash of 0x1234567890 as cv.pdf"
- "download /root/cv.pdf with root hash 0x1234567890 from zero gravity storage"

If the user provides a specific file path, use that as the file path. Otherwise, use the file name in the current directory.
In the case of downloading a file, the user will provide the root hash of the file.

Current directory info:
- Current working directory: \`\${process.cwd()}\` (Path where the current program is running).
- Files in current directory: \`{{listFilesInCurrentDir}}\``;

