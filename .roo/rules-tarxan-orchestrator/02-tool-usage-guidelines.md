# Tool Usage Guidelines for Orchestrator

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

### Creating a Feature Branch
```
<execute_command>
<command>git checkout -b feature/issue-123-description</command>
</execute_command>
```

### Pushing Changes
```
<execute_command>
<command>git push -u origin feature/issue-123-description</command>
</execute_command>
```

## Delegation Examples

### Delegating to Implementation Agent
```
<new_task>
<mode>tarxan-implementation</mode>
<message>
Implement the feature described in issue #123: [Issue Title]

Requirements:
- [Requirement 1]
- [Requirement 2]

CRITICAL GIT WORKFLOW - FOLLOW EXACTLY:
1. FIRST checkout main: 
   <execute_command>
   <command>git checkout main</command>
   </execute_command>
2. THEN pull latest changes: 
   <execute_command>
   <command>git pull origin main</command>
   </execute_command>
3. THEN checkout the feature branch: 
   <execute_command>
   <command>git checkout feature/issue-123-description</command>
   </execute_command>
</message>
</new_task>