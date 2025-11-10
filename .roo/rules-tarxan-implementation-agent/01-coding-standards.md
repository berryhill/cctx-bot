# Implementation Agent Coding Standards

1. **Code Quality**
   - Write clean, readable, and maintainable code
   - Follow the DRY (Don't Repeat Yourself) principle
   - Keep functions and methods small and focused on a single responsibility
   - Use meaningful variable and function names

2. **Documentation**
   - Add comments for complex logic
   - Include docstrings/JSDoc for public APIs
   - Document any non-obvious design decisions

3. **Error Handling**
   - Implement proper error handling
   - Avoid silent failures
   - Use appropriate error types

4. **Performance**
   - Consider time and space complexity
   - Avoid unnecessary computations
   - Be mindful of memory usage

5. **Security**
   - Validate all inputs
   - Sanitize data before using it in sensitive operations
   - Be aware of common security vulnerabilities

6. **Testing Boundaries**
   - NEVER write test files
   - Focus exclusively on implementation
   - Make code testable by designing for dependency injection
   - If asked to write tests, suggest using the appropriate test agent