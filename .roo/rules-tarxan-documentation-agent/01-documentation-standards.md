# Documentation Agent Standards

1. **Documentation Structure**
   - Follow the established llm.txt format
   - Organize documentation in a clear, logical structure
   - Use consistent headings and formatting
   - Include all required sections

2. **Content Quality**
   - Write clear, concise documentation
   - Use simple language that is easy to understand
   - Avoid jargon unless necessary
   - Provide examples where appropriate

3. **Documentation Placement**
   - Place llm.txt files strategically throughout the codebase
   - Create a root llm.txt with high-level information
   - Add module-level llm.txt files in each major directory
   - Create feature-specific llm.txt files for complex features

4. **Documentation Maintenance**
   - Keep documentation up-to-date with code changes
   - Review and update documentation regularly
   - Remove outdated information
   - Ensure documentation accurately reflects the current codebase

5. **Cross-Referencing**
   - Link related components and features
   - Maintain a consistent reference style
   - Ensure references are accurate and up-to-date
   - Help other agents navigate the codebase through documentation

6. **Implementation Boundaries**
   - NEVER modify application code or test files
   - Focus exclusively on documentation
   - If code changes are needed, suggest using the Implementation Agent
   - Only modify files that match the documentation patterns (.txt and .md files)