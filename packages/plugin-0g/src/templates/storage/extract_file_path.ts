export const zgsExtractFilePathTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "filePath": null,
}
\`\`\`

{{recentMessages}}

Extract the user's intention to upload a file from the conversation. Users might express this in various ways, such as:
- "I want to upload a file"
- "upload an image"
- "send a photo"
- "upload"
- "let me share a file"

If the user provides a specific file path, use that as the file path. Otherwise, use the file name in the current directory.

Current directory info:
- Current working directory: \`\${process.cwd()}\` (Path where the current program is running).
- Files in current directory: \`{{listFilesInCurrentDir}}\``;

