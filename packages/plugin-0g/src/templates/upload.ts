export const uploadTemplate = `Respond with a JSON string containing only the extracted values. Use null for any values that cannot be determined. Only valid JSON tokens should be returned and no markdown token like \`\`\`json or \`\`\` should appear.

Example response:
\`\`\`json
{
    "filePath": null,
    "description": "I want to upload a file"
}
\`\`\`

{{recentMessages}}

Extract the user's intention to upload a file from the conversation. Users might express this in various ways, such as:
- "I want to upload a file"
- "upload an image"
- "send a photo"
- "upload"
- "let me share a file"

If the user provides any specific description of the file, include that as well.

Respond with a JSON string containing only the extracted values. Only valid JSON tokens should be returned and no markdown token like \`\`\`json or \`\`\` should appear.`;
