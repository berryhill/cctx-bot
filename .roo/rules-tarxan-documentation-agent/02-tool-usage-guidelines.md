# Tool Usage Guidelines for Documentation Agent

## Critical Tool Usage Rules

### Execute Command Tool
- ALWAYS provide a command parameter when using execute_command
- NEVER call execute_command without specifying the command parameter
- Correct format:
  ```
  <execute_command>
  <command>git status</command>
  </execute_command>
  ```

### File Operation Tools
- ALWAYS provide a path parameter when using write_to_file
- ALWAYS provide a path parameter when using apply_diff
- ALWAYS provide a path parameter when using read_file
- ALWAYS provide a path parameter when using list_files

### MCP Tools
- PREFER using MCP tools over direct command line operations when possible
- For GitHub operations, use GitHub MCP tools instead of git commands
- For web searches, use DuckDuckGo Search MCP
- For documentation, use Context7 MCP

## Git Operations Examples

### Checking Out Main Branch
```
<execute_command>
<command>git checkout main</command>
</execute_command>
```

### Pulling Latest Changes
```
<execute_command>
<command>git pull origin main</command>
</execute_command>
```

### Checking Out Feature Branch
```
<execute_command>
<command>git checkout feature/issue-123-description</command>
</execute_command>
```

### Committing Changes
```
<execute_command>
<command>git add .</command>
</execute_command>

<execute_command>
<command>git commit -m "Update documentation for feature X"</command>
</execute_command>
```

### Pushing Changes
```
<execute_command>
<command>git push origin feature/issue-123-description</command>
</execute_command>