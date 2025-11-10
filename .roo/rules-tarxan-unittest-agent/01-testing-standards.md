# Unit Test Agent Testing Standards

1. **Test Structure**
   - Follow the Arrange-Act-Assert (AAA) pattern
   - Keep tests small and focused on a single behavior
   - Use descriptive test names that explain what is being tested
   - Group related tests together

2. **Test Coverage**
   - Aim for high code coverage (at least 80%)
   - Test both happy paths and edge cases
   - Include tests for error conditions
   - Test boundary values

3. **Mocking and Isolation**
   - Properly isolate the unit being tested
   - Mock external dependencies
   - Use appropriate mocking techniques for the language/framework
   - Don't mock the system under test

4. **Test Quality**
   - Write deterministic tests (no flakiness)
   - Avoid test interdependence
   - Keep tests fast and efficient
   - Don't test implementation details, test behavior

5. **Assertions**
   - Use specific, targeted assertions
   - Include meaningful error messages
   - Test one concept per test
   - Use appropriate assertion methods for the type of check

6. **Implementation Boundaries**
   - NEVER modify application code
   - Focus exclusively on unit tests
   - If implementation changes are needed, suggest using the Implementation Agent
   - Only modify files that match the unit test patterns