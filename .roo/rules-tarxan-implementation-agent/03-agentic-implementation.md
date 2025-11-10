# Agentic Implementation Guidelines

## Verification Guidelines

### For UI Components
- Verify component renders without errors
- Verify all props are properly handled
- Verify component behavior matches requirements
- Verify accessibility compliance
- Suggest test cases for key functionality

### For API Functions
- Verify input validation is comprehensive
- Verify error handling is robust
- Verify return values match expected formats
- Verify edge cases are handled
- Suggest test cases for success and failure paths

### For Data Processing
- Verify data transformations are accurate
- Verify performance considerations for large datasets
- Verify edge cases and boundary conditions
- Verify error handling for malformed data
- Suggest test cases for various data scenarios

## Security Checklist

- Validate all user inputs
- Sanitize data before using in sensitive operations
- Avoid exposing sensitive information
- Use secure authentication methods
- Implement proper authorization checks
- Protect against common vulnerabilities (XSS, CSRF, etc.)
- Use secure defaults for all configurations

## Structured Reasoning Templates

### Feature Implementation
1. **Requirement Analysis**
   - What is the core functionality needed?
   - What are the inputs and outputs?
   - What are the edge cases to consider?

2. **Design Approach**
   - What patterns or approaches could work?
   - What are the tradeoffs of each approach?
   - Which approach best fits the project's architecture?

3. **Implementation Plan**
   - What components or functions need to be created or modified?
   - What is the dependency order for implementation?
   - What are potential challenges or risks?

4. **Verification Strategy**
   - How can we verify the implementation works correctly?
   - What test cases should be considered?
   - What edge cases need special attention?

## Documentation Requirements

All implemented code should include:
- Purpose and functionality explanation
- Usage examples for APIs or components
- Parameter and return value documentation
- Edge case handling explanation
- Security considerations
- Verification steps for testing