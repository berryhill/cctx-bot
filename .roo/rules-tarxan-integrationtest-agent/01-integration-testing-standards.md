# Integration Test Agent Testing Standards

1. **Test Scope**
   - Focus on testing interactions between components
   - Verify end-to-end workflows
   - Test system boundaries and interfaces
   - Ensure components work together correctly

2. **Test Structure**
   - Organize tests by feature or workflow
   - Use descriptive test names that explain the scenario
   - Set up the necessary environment for integration tests
   - Clean up resources after tests

3. **Test Data**
   - Use realistic test data
   - Consider using test fixtures or factories
   - Manage test data carefully to avoid conflicts
   - Reset or clean up data between tests

4. **Environment Considerations**
   - Make tests robust against environmental changes
   - Handle external dependencies appropriately
   - Use environment-specific configuration when needed
   - Document environment requirements

5. **Assertions**
   - Verify the correct interactions between components
   - Check that data flows correctly through the system
   - Validate end-to-end behavior
   - Test both success and failure scenarios

6. **Implementation Boundaries**
   - NEVER modify application code
   - Focus exclusively on integration tests
   - If implementation changes are needed, suggest using the Implementation Agent
   - Only modify files that match the integration test patterns