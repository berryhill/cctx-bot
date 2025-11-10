# Golang Testing Patterns and Best Practices

## Core Testing Principles

When writing unit tests for Go code, follow these established patterns and best practices:

### 1. Table-Driven Tests (Primary Pattern)

Use table-driven tests for testing multiple scenarios efficiently:

```go
func TestFunctionName(t *testing.T) {
    tests := []struct {
        name     string
        input    InputType
        expected ExpectedType
        wantErr  bool
    }{
        {
            name:     "valid input",
            input:    ValidInput{},
            expected: ExpectedOutput{},
            wantErr:  false,
        },
        {
            name:     "invalid input",
            input:    InvalidInput{},
            expected: nil,
            wantErr:  true,
        },
        {
            name:     "edge case - empty",
            input:    EmptyInput{},
            expected: DefaultOutput{},
            wantErr:  false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := FunctionName(tt.input)
            
            if (err != nil) != tt.wantErr {
                t.Errorf("FunctionName() error = %v, wantErr %v", err, tt.wantErr)
                return
            }
            
            if !reflect.DeepEqual(got, tt.expected) {
                t.Errorf("FunctionName() = %v, want %v", got, tt.expected)
            }
        })
    }
}
```

### 2. Map-Based Test Cases (Alternative Pattern)

For better test independence and readability:

```go
func TestFunction(t *testing.T) {
    tests := map[string]struct {
        input    string
        expected string
        wantErr  bool
    }{
        "empty string": {
            input:    "",
            expected: "",
            wantErr:  false,
        },
        "valid input": {
            input:    "test",
            expected: "TEST",
            wantErr:  false,
        },
        "invalid characters": {
            input:    "test@#$",
            expected: "",
            wantErr:  true,
        },
    }

    for name, test := range tests {
        t.Run(name, func(t *testing.T) {
            got, err := Function(test.input)
            
            if (err != nil) != test.wantErr {
                t.Fatalf("Function(%q) error = %v, wantErr %v", test.input, err, test.wantErr)
            }
            
            if got != test.expected {
                t.Errorf("Function(%q) = %q, want %q", test.input, got, test.expected)
            }
        })
    }
}
```

### 3. Test Naming Conventions

- Test files: `*_test.go`
- Test functions: `TestFunctionName(t *testing.T)`
- Benchmark functions: `BenchmarkFunctionName(b *testing.B)`
- Example functions: `ExampleFunctionName()`
- Subtests: Use descriptive names that explain the scenario

### 4. Error Handling and Messages

- Use `t.Errorf()` for non-fatal errors (test continues)
- Use `t.Fatalf()` for fatal errors (test stops)
- Provide clear error messages with input, got, and want values
- Include the function being tested and input parameters in error messages

```go
if got != expected {
    t.Errorf("FunctionName(%v) = %v, want %v", input, got, expected)
}
```

### 5. Test Organization

- Group related tests in the same file
- Use subtests (`t.Run()`) for variations of the same test
- Keep tests close to the code they're testing (same package)
- Use `_test` package suffix only when testing exported API

### 6. Parallel Testing

Use parallel testing for independent test cases:

```go
func TestParallelFunction(t *testing.T) {
    t.Parallel() // Mark the entire test as parallel
    
    tests := []struct {
        name string
        // ... test fields
    }{
        // ... test cases
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            t.Parallel() // Mark each subtest as parallel
            // ... test logic
        })
    }
}
```

### 7. Mocking and Dependencies

- Use interfaces for testable dependencies
- Create simple mock implementations for testing
- Use dependency injection to make code testable

```go
type MockService struct {
    result string
    err    error
}

func (m *MockService) Method(input string) (string, error) {
    return m.result, m.err
}

func TestWithMock(t *testing.T) {
    mock := &MockService{
        result: "expected",
        err:    nil,
    }
    
    got := FunctionUsingService(mock, "input")
    // ... assertions
}
```

### 8. Common Test Patterns

**Testing Errors:**
```go
if err == nil {
    t.Fatal("expected error, got nil")
}

if !errors.Is(err, ExpectedErrorType) {
    t.Errorf("expected error type %T, got %T", ExpectedErrorType, err)
}
```

**Testing Panics:**
```go
defer func() {
    if r := recover(); r == nil {
        t.Errorf("expected panic, but function did not panic")
    }
}()
FunctionThatShouldPanic()
```

**Setup and Teardown:**
```go
func TestWithSetup(t *testing.T) {
    // Setup
    resource := setupTestResource()
    defer cleanupTestResource(resource) // Teardown
    
    // Test logic
}
```

### 9. Best Practices Summary

1. **Use table-driven tests** for multiple scenarios
2. **Write descriptive test names** that explain the scenario
3. **Test edge cases** including empty inputs, nil values, boundary conditions
4. **Test error conditions** explicitly
5. **Keep tests simple** and focused on one behavior
6. **Use t.Helper()** in test helper functions
7. **Avoid test dependencies** - each test should be independent
8. **Test the public API** primarily, not internal implementation details
9. **Use meaningful assertions** with clear error messages
10. **Keep test data close** to the test that uses it

### 10. Example Complete Test File

```go
package mypackage

import (
    "errors"
    "reflect"
    "testing"
)

func TestCalculate(t *testing.T) {
    tests := []struct {
        name     string
        a, b     int
        op       string
        expected int
        wantErr  bool
    }{
        {
            name:     "addition",
            a:        5, b: 3,
            op:       "add",
            expected: 8,
            wantErr:  false,
        },
        {
            name:     "division by zero",
            a:        5, b: 0,
            op:       "div",
            expected: 0,
            wantErr:  true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := Calculate(tt.a, tt.b, tt.op)
            
            if (err != nil) != tt.wantErr {
                t.Errorf("Calculate(%d, %d, %q) error = %v, wantErr %v", 
                    tt.a, tt.b, tt.op, err, tt.wantErr)
                return
            }
            
            if got != tt.expected {
                t.Errorf("Calculate(%d, %d, %q) = %d, want %d", 
                    tt.a, tt.b, tt.op, got, tt.expected)
            }
        })
    }
}
```

These patterns ensure your Go tests are maintainable, readable, and follow Go community standards.