# Mode Manager Documentation

## Overview

The Mode Manager is a specialized Roo mode designed to create, organize, update, and manage custom Roo modes. It implements changes directly based on user instructions without unnecessary planning or explanations.

## Purpose

The Mode Manager acts as an expert in Roo modes, providing capabilities for:

1. Creating new custom modes with all required components
2. Updating existing modes to incorporate new features or capabilities
3. Organizing the mode ecosystem for clarity and efficiency
4. Maintaining a cohesive mode ecosystem

## Key Capabilities

### Mode Creation and Implementation
- Generate properly structured YAML configurations
- Create system prompt files
- Set up rules directories and files
- Implement appropriate file permissions

### Mode Updates
- Directly implement requested changes
- Update system prompts and configurations
- Modify file permissions as needed

## Usage

### Creating a New Mode

To create a new custom mode:

1. Activate the Mode Manager:
   ```
   /mode tarxan-mode-manager
   ```

2. Request a new mode creation:
   ```
   Create a new custom mode for [purpose]
   ```

### Updating an Existing Mode

To update an existing mode:

1. Activate the Mode Manager:
   ```
   /mode tarxan-mode-manager
   ```

2. Request a mode update:
   ```
   Update the [mode-name] mode to [description of changes]
   ```

## Mode Structure

The Mode Manager creates and manages modes with the following structure:

1. **Mode Configuration** in `.roomodes`:
   ```yaml
   customModes:
     - slug: mode-slug
       name: 🔍 Mode Name
       description: Brief description of the mode
       roleDefinition: Detailed description of the mode's role
       whenToUse: Guidance on when to use the mode
       customInstructions: Specific behavioral guidelines
       groups:
         - read
         - - edit
           - fileRegex: \.(ext)$
             description: File types description
         - command
         - browser
         - mcp
   ```

2. **System Prompt File** at `.roo/system-prompt-mode-slug`

3. **Rules Directory** at `.roo/rules-mode-slug/` (if needed)

## Existing Custom Modes

### tarxan-implementation-agent
- **Purpose**: Writing and modifying application code and unit tests
- **Key Features**:
  - Implements both application code AND unit tests
  - Implements features based on specifications
  - Writes comprehensive unit tests for all functionality
  - Documents code with clear comments
  - Considers performance, security, and maintainability
  - Covers edge cases and error scenarios in tests
  - Uses appropriate testing frameworks and mocking strategies

### tarxan-unittest-agent
- **Purpose**: Writing unit tests for individual components
- **Key Features**:
  - Focuses only on unit test files
  - Creates isolated tests with appropriate mocking
  - Covers edge cases and error scenarios
  - Ensures tests are deterministic and repeatable

### tarxan-architect
- **Purpose**: High-level system design and architecture
- **Key Features**:
  - Creates architectural documentation
  - Uses Mermaid diagrams for visual representations
  - Defines component interfaces and interactions
  - Documents architectural decisions
  - File permissions restricted to .md files only

### tarxan-documentation-agent
- **Purpose**: Creating and updating documentation in the `docs` directory only
- **Key Features**:
  - **Docs Directory Restriction**: Can ONLY create/modify files within the `docs/` directory
  - **Structured Organization**: Organizes documentation in logical subdirectories within `docs/`
  - Generates documentation for new features in appropriate `docs/` subdirectories
  - Updates documentation when code changes
  - Follows established documentation patterns and standards
  - Creates comprehensive documentation for components, APIs, features, and architecture

### tarxan-orchestrator
- **Purpose**: Coordinating complex, multi-step backend projects with documentation context passing
- **Key Features**:
  - **BACKEND-ONLY PROJECT**: Exclusively handles server-side code, APIs, databases, and backend services
  - Coordinates work between `tarxan-implementation-agent` and `tarxan-documentation-agent` only
  - **Exact Mode Delegation**: Knows to delegate specifically to `tarxan-implementation-agent` and `tarxan-documentation-agent`
  - **Documentation Context Passing**: Examines `docs` directory and passes relevant context to all agents
  - **Documentation Lookup**: Always examines existing documentation before delegating tasks
  - Breaks down complex backend tasks into subtasks
  - Manages Git workflow and pull request process
  - Enforces proper Git workflow (checkout main, pull main, then checkout feature branch)
  - Prompts `tarxan-implementation-agent` to research resources using ddg-search MCP
  - Provides example MCP commands for resource lookup
  - Tracks progress across implementation and documentation aspects of backend tasks
  - NEVER writes code itself - strictly delegates implementation
  - NEVER reads the codebase itself - delegates that to specialized agents
  - Creates feature branches before delegating implementation
  - Ensures all agents commit their code to the feature branch
  - **CRITICAL**: Ensures `tarxan-implementation-agent` writes unit tests and verifies they pass
  - NO SEPARATE TESTING DELEGATION - `tarxan-implementation-agent` handles all unit testing

### tarxan-integrationtest-agent
- **Purpose**: Writing integration tests for BACKEND systems only
- **Key Features**:
  - **BACKEND TASKS ONLY**: Only engages for API endpoints, server logic, database operations
  - **Frontend Task Detection**: Politely declines frontend tasks and suggests reconsideration
  - Focuses only on integration test files for backend systems
  - Tests API endpoints and server component interactions
  - Tests database operations and data persistence
  - Considers system boundaries and interfaces
  - Ensures tests are robust against environmental changes

### tarxan-delegator
- **Purpose**: Breaking down architecture into implementable tasks with comprehensive resource integration
- **Key Features**:
  - Reviews architectural documentation
  - **Task Type Classification**: Determines whether tasks are frontend or backend
  - **Label Management**: Applies appropriate "frontend" or "backend" labels to GitHub issues
  - **Comprehensive Resource Integration**: Extracts ALL relevant resources from architecture documents
  - **Resource Categorization**: Organizes resources by type (library docs, specifications, research materials, architecture references)
  - **Task-Specific Resource Matching**: Includes technology stack and component-specific resources
  - **Resource Context Addition**: Provides explanations for why each resource is relevant
  - Creates GitHub issues with comprehensive Resources sections
  - Determines logical sequence and dependencies
  - Provides implementation guidance in issues

### tarxan-mode-manager
- **Purpose**: Creating and editing Roo custom modes
- **Key Features**:
  - Follows user's exact directions
  - Implements changes immediately without planning
  - Creates backups before making changes
  - Maintains the mode ecosystem
  - Operates additively with targeted changes
  - Reads documentation on task start
  - Updates documentation after changes
  - NEVER reads back files to the user

## Operational Principles

The Mode Manager follows these operational principles:

1. **Read Documentation First**: The Mode Manager reads this documentation file at the start of each task to ensure it has the latest context.

2. **Additive Changes**: When fixing or updating modes, the Mode Manager operates additively, making targeted additions or changes rather than bulk removals.

3. **Documentation Updates**: After making changes to any mode, the Mode Manager updates this documentation file to reflect the current state of all modes.

4. **Backup Before Changes**: Before modifying any files, the Mode Manager creates backups to ensure no data is lost.

5. **Direct Implementation**: The Mode Manager implements changes immediately without unnecessary planning or explanations.

## Mode Updates - 2025-08-05

### Error Fixes
- Updated system prompts for all agents to fix errors with apply_diff and write_to_file functions
- Fixed read_file examples in all system prompts to use the correct format
- Added explicit instructions to always provide the 'path' parameter when using apply_diff and write_to_file functions
- These changes address errors where Roo was attempting to use these functions without providing the required path parameter

### Best Practices Added
- Added explicit reminders in system prompts about required parameters for tool functions
- Implemented consistent error prevention instructions across multiple modes
- Updated tool descriptions to emphasize the requirement for path parameters

## Mode Updates - 2025-08-05 (Additional)

### tarxan-orchestrator
- Added critical Git workflow requirements to ensure proper branch management
- Enforced checkout main, pull main before checking out feature branches to prevent merge conflicts
- Updated task templates to include explicit Git workflow instructions for all specialized agents
- Added instructions to prompt implementation agent to use ddg-search MCP for researching resources
- Included example ddg-search MCP commands in task templates for implementation agent
- Enhanced resource handling guidelines to emphasize MCP-based research

## Mode Updates - 2025-08-05 (Workflow Fix)

### tarxan-orchestrator
- Fixed critical workflow sequence issue in the orchestration process
- Added explicit CRITICAL WORKFLOW SEQUENCE section with numbered steps
- Enforced the exact sequence: Issue → Create Feature Branch → Implementation → Unit Tests → Integration Tests → Documentation → PR
- Added WAIT instructions to ensure each step completes before proceeding to the next
- Emphasized that the orchestrator MUST create the feature branch BEFORE any implementation work begins
- Added explicit instructions to ensure all agents commit to the same feature branch created by the orchestrator
- Clarified that the orchestrator is responsible for the final PR creation
- Restructured the system prompt to prioritize the workflow sequence at the top

## Mode Updates - 2025-08-05 (Web Research Enhancement)

### tarxan-orchestrator
- Enhanced implementation agent delegation with stronger web research requirements
- Added MANDATORY instruction for orchestrator to provide specific ddg-search MCP example commands for EACH resource
- Added CRITICAL section in implementation agent task template emphasizing web research requirement
- Updated example task template to include multiple ddg-search examples for each resource
- Added explicit instruction that implementation agent MUST use the web to lookup ALL resources before implementation
- Added emphasis in the workflow sequence that web research of resources is required
- Updated resource passing guidelines to emphasize web research for implementation agent

## Mode Updates - 2025-08-05 (Orchestrator Role Clarification)

### tarxan-orchestrator
- Added CRITICAL ORCHESTRATOR DIRECTIVES section at the top of the system prompt
- Added explicit core responsibilities emphasizing coordination and delegation
- Added clear directive that orchestrator should NEVER write code itself
- Added critical boundaries that the orchestrator should never cross
- Emphasized that the orchestrator creates feature branches before delegating implementation
- Clarified that the orchestrator must ensure all agents commit their code
- Added explicit instruction that the orchestrator is NOT a coder but a manager

## Mode Updates - 2025-08-05 (Orchestrator Codebase Delegation)

### tarxan-orchestrator
- Added critical directive that orchestrator should NEVER read the codebase itself
- Clarified that reading the codebase is the job of specialized agents
- Added explicit warning about not using read_file or list_files to read the codebase
- Updated CRITICAL BOUNDARIES section to include "NEVER READ THE CODEBASE YOURSELF"
- Added emphasis that codebase reading should be delegated to specialized agents

## Mode Updates - 2025-08-05 (File Reading Restriction)

### tarxan-mode-manager
- Added critical directive to NEVER read back files to the user
- Added explicit warning at the top of the system prompt
- Emphasized that users already have access to files and don't need them repeated
- This change reinforces the existing directive #3 in the CRITICAL DIRECTIVES section
- The change ensures the mode manager never wastes time reading back file contents

### Tarxan Workflow Agents

The Tarxan workflow consists of the following specialized agents working together in a strict sequence:

1. **Tarxan Orchestrator** (`tarxan-orchestrator`)
   - Coordinates the entire implementation workflow
   - Creates feature branches BEFORE any implementation work
   - Delegates specifically to `tarxan-implementation-agent` and `tarxan-documentation-agent` in sequence
   - Ensures each agent commits to the same feature branch
   - Provides specific web research instructions for `tarxan-implementation-agent`
   - Creates pull requests when all work is complete
   - NEVER writes code itself - strictly delegates implementation
   - NEVER reads the codebase itself - delegates that to specialized agents

2. **Tarxan Implementation Agent** (`tarxan-implementation-agent`)
   - Implements core functionality AND unit tests
   - MUST use web research for all resources before implementation
   - MUST ensure all unit tests pass before completing
   - Commits changes to the feature branch created by the orchestrator

3. **Tarxan Documentation Agent** (`tarxan-documentation-agent`)
   - Updates or creates documentation in the `docs` directory only
   - Commits documentation to the feature branch created by the orchestrator

### Workflow Process

1. `tarxan-orchestrator` receives issue and creates feature branch
2. `tarxan-implementation-agent` researches ALL resources via web and implements core functionality AND unit tests on that branch
3. `tarxan-documentation-agent` updates documentation on that branch
4. `tarxan-orchestrator` creates pull request from that branch to dev

All agents work on the same feature branch created by the `tarxan-orchestrator`, and each agent commits their changes to this branch. The workflow is strictly sequential, with each agent waiting for the previous one to complete before starting their work. The `tarxan-implementation-agent` must thoroughly research all resources using the web before beginning implementation and MUST ensure all unit tests pass before completing.

## Branch Management Rules

The following agents should NEVER switch branches or pull from dev:
- `tarxan-implementation-agent`
- `tarxan-documentation-agent`

Branch management is the EXCLUSIVE responsibility of the `tarxan-orchestrator` agent. The specialized agents should work on whatever branch they find themselves on and only commit their changes when their specific task is complete. The orchestrator handles all branch creation, switching, and management operations.

## Mode Updates - 2025-08-05 (Branch Management)

### Implementation, UnitTest, IntegrationTest, and Documentation Agents
- Added critical directive that these agents should NEVER switch branches or pull from main
- Clarified that branch management is the responsibility of the orchestrator agent
- Specified that these agents should only commit their changes when their specific task is complete
- Removed instructions for these agents to checkout or pull branches
- This change ensures proper branch management workflow where only the orchestrator handles branch operations

## Mode Updates - 2025-08-06 (Tool Usage Guidelines)

### Common Tool Usage Guidelines
- Added `.roo/rules/02-tool-usage-guidelines.md` with common tool usage guidelines for all agents
- Added specific guidelines for execute_command, file operations, and MCP tools
- Included examples of proper tool usage for common operations
- This change ensures all agents follow consistent tool usage patterns

### Agent-Specific Tool Usage Guidelines
- Added agent-specific tool usage guideline files to each agent's rules directory:
  - `.roo/rules-tarxan-orchestrator/02-tool-usage-guidelines.md`
  - `.roo/rules-tarxan-implementation-agent/02-tool-usage-guidelines.md`
  - `.roo/rules-tarxan-unittest-agent/02-tool-usage-guidelines.md`
  - `.roo/rules-tarxan-integrationtest-agent/02-tool-usage-guidelines.md`
  - `.roo/rules-tarxan-documentation-agent/02-tool-usage-guidelines.md`
  - `.roo/rules-tarxan-architect/02-tool-usage-guidelines.md`
  - `.roo/rules-tarxan-planning-agent/02-tool-usage-guidelines.md`
  - `.roo/rules-tarxan-delegator/02-tool-usage-guidelines.md`
- Each file contains agent-specific examples and guidelines
- Emphasized proper parameter usage for all tool functions

### Critical Tool Usage Rules
- ALWAYS provide a command parameter when using execute_command
- ALWAYS provide a path parameter when using file operation tools
- PREFER using MCP tools over direct command line operations when possible
- These changes address errors where Roo was attempting to use tools without providing required parameters
- Specifically fixes the issue with Tarxan-Orchestrator mode throwing an error when using execute_command without a command parameter

## Mode Updates - 2025-08-28 (Frontend/Backend Task Detection)

### tarxan-orchestrator
- Added **Task Type Detection** capability to distinguish frontend vs backend tasks
- **Conditional Integration Testing**: Automatically skips integration testing for frontend tasks
- Frontend tasks (UI, styling, client-side logic) now bypass integration testing phase
- Backend tasks (API endpoints, server logic, database) include full integration testing
- Updated workflow sequence to include task type detection as step 2
- Enhanced delegation logic to route tasks appropriately based on type

### tarxan-integrationtest-agent
- **Scope Restriction**: Now explicitly limited to BACKEND tasks only
- Added clear definitions of applicable vs non-applicable task types
- Will politely decline frontend tasks and suggest workflow reconsideration
- Enhanced focus on API endpoints, server interactions, and backend component integration
- Clarified role in testing database operations and server-side business logic

### tarxan-delegator
- Added **Task Type Classification** as core responsibility
- **Enhanced Labeling**: Now applies proper "frontend" or "backend" labels to GitHub issues
- Improved task identification to categorize components by type
- Updated GitHub issue creation to include critical task type labeling
- Enhanced workflow to support orchestrator's task type detection needs

These updates enable the workflow to automatically detect task types and route them appropriately, ensuring frontend tasks don't unnecessarily engage the integration testing agent while maintaining full testing coverage for backend systems.

## Mode Updates - 2025-08-28 (Documentation System Refactor)

### tarxan-documentation-agent
- **Docs Directory Restriction**: Now can ONLY create and modify files within the `docs/` directory
- **Structured Organization**: Organizes documentation in logical subdirectories:
  - `docs/README.md`: Project overview and high-level information
  - `docs/components/`: Documentation for individual components
  - `docs/api/`: API documentation
  - `docs/features/`: Feature-specific documentation
  - `docs/architecture/`: Architectural documentation and decisions
- **Enhanced Focus**: Concentrates solely on comprehensive documentation within the centralized docs structure
- **CRITICAL RESTRICTION**: Cannot create llm.txt files or documentation anywhere else in the codebase

### tarxan-orchestrator
- **Documentation Context Passing**: Now examines the `docs` directory before delegating tasks
- **Documentation Lookup Phase**: Added as step 2 in workflow sequence to gather existing documentation context
- **Context Distribution**: Passes relevant documentation context to all specialized agents:
  - Implementation Agent receives existing component/API documentation
  - Unit Test Agent receives existing testing patterns and standards
  - Integration Test Agent receives API documentation and testing patterns
  - Documentation Agent receives context about existing documentation structure
- **Enhanced Task Instructions**: All delegated tasks now include documentation context summaries
- **Documentation-Aware Delegation**: Ensures all agents understand existing patterns and standards

### Workflow Enhancement
- **Documentation-First Approach**: Orchestrator now always checks for existing documentation before starting work
- **Context Continuity**: Ensures all agents work with awareness of existing documentation and patterns
- **Centralized Documentation**: All documentation creation is now centralized in the `docs` directory
- **Pattern Consistency**: Agents receive context about existing patterns to ensure consistency

These updates establish a documentation-first approach where the orchestrator ensures all agents have proper context from existing documentation, while centralizing all documentation creation in the `docs` directory for better organization and maintenance.

### tarxan-delegator (Resource Integration Enhancement)
- **Mandatory Resource Integration**: Every GitHub issue MUST include comprehensive Resources section
- **Enhanced Resource Categorization**: Organizes resources into clear categories:
  - Library Documentation (framework docs, API references)
  - Technical Specifications (standards, protocols, formats)
  - Research Materials (best practices, tutorials, examples)
  - Architecture References (specific sections from architecture document)
- **Task-Specific Resource Matching**: Includes technology stack and component-specific resources
- **Resource Context Addition**: Provides explanations for why each resource is relevant to the task
- **Resource Integration Workflow**: 5-step process for comprehensive resource inclusion
- **Quality Verification**: Ensures no critical resources are missing from GitHub issues

### Additional Files Created
- **`.roo/rules-tarxan-orchestrator/01-orchestrator-principles.md`**: Comprehensive principles document covering:
  - Core responsibilities and boundaries
  - Task type detection criteria
  - Documentation-first workflow principles
  - Delegation standards for each agent type
  - Git workflow management requirements
  - Quality assurance standards
  - Communication and coordination guidelines

The final enhancement ensures that all GitHub issues created by the delegator include comprehensive, categorized, and contextualized resources from the architecture documents, providing implementers with all necessary documentation and references for consistent, high-quality task completion.

## Mode Updates - 2025-09-04 (Testing Delegation Removal)

### tarxan-orchestrator
- **MAJOR CHANGE**: Removed all testing delegation capabilities from the orchestrator
- **Workflow Simplification**: Now only coordinates Implementation Agent and Documentation Agent
- **Removed Features**:
  - Task type detection (frontend vs backend)
  - Unit testing delegation to Unit Test Agent
  - Integration testing delegation to Integration Test Agent
  - Test extensivity guidelines handling
  - Conditional integration testing logic
- **Updated Workflow**: Simplified to Implementation → Documentation → PR
- **Scope Reduction**: Orchestrator now focuses purely on implementation and documentation coordination
- **Documentation Update**: Updated mode documentation to reflect "NO TESTING DELEGATION" policy

This change streamlines the orchestrator to focus on core implementation and documentation workflows, removing all testing-related coordination responsibilities.

### tarxan-implementation-agent (Unit Testing Integration)
- **MAJOR CHANGE**: Implementation Agent now responsible for both application code AND unit tests
- **Expanded Scope**: No longer restricted from writing test files
- **Updated Workflow**: Implementation Agent writes code and corresponding unit tests in single task
- **Comprehensive Testing**: Required to write unit tests covering edge cases and error scenarios
- **Testing Expertise**: Role definition updated to include testing frameworks and best practices knowledge
- **Unified Responsibility**: Single agent now handles both implementation and unit testing phases

This change consolidates implementation and unit testing into a single agent responsibility, eliminating the need for separate unit test delegation while maintaining comprehensive test coverage.

## Mode Updates - 2025-09-04 (Unit Testing Responsibility Clarification)

### CRITICAL CHANGE: No Unit Test Agent Delegation

- **MAJOR CLARIFICATION**: The tarxan-orchestrator should NEVER delegate to the unit test agent
- **Implementation Agent Full Responsibility**: Implementation agent handles BOTH code implementation AND unit testing
- **Orchestrator Workflow Update**:
  - Orchestrator ONLY delegates to Implementation Agent and Documentation Agent
  - Implementation Agent MUST write unit tests and ensure they pass before completing
  - NO separate unit testing phase or delegation
- **Unit Test Agent Role**: The unit test agent mode exists but should NOT be used in normal orchestrator workflows
- **Workflow Simplification**:
  1. Orchestrator creates feature branch
  2. Implementation Agent implements code AND unit tests (ensuring tests pass)
  3. Documentation Agent updates documentation
  4. Orchestrator creates PR

### Critical Instructions Added to Orchestrator
- **Explicit unit testing requirements** in Implementation Agent delegation
- **Test verification requirements** - Implementation Agent must run tests and verify they pass
- **No separate testing delegation** - orchestrator workflow simplified to Implementation + Documentation only

This change ensures the `tarxan-implementation-agent` takes full responsibility for both application code and unit testing, with mandatory test verification before task completion.

## Mode Updates - 2025-09-25 (Exact Mode Delegation)

### tarxan-orchestrator
- **CRITICAL UPDATE**: Now explicitly knows the exact mode names it needs to delegate to
- **Exact Mode References**: Updated all references to use specific mode slugs:
  - `tarxan-implementation-agent` for implementation and unit testing
  - `tarxan-documentation-agent` for documentation in the `docs` directory
- **Enhanced Delegation Clarity**: All delegation examples now use exact mode names
- **Documentation Alignment**: Updated workflow documentation to reflect specific agent names
- **Improved Task Creation**: Example task creation now uses `tarxan-implementation-agent` mode

This change ensures the orchestrator has precise knowledge of which specific Roo modes to delegate to, eliminating any ambiguity in the delegation process.

## Mode Updates - 2025-09-25 (Dev Branch Integration)

### tarxan-orchestrator
- **CRITICAL BRANCH UPDATE**: Changed root branch from `main` to `dev` throughout the workflow
- **Git Workflow Updates**: All Git operations now use `dev` as the base branch:
  - `git checkout dev` instead of `git checkout main`
  - `git pull origin dev` instead of `git pull origin main`
  - Feature branches created from `dev` branch
  - Pull requests target `dev` branch instead of `main`
- **Task Template Updates**: Updated all example Git commands in task templates to use `dev` branch
- **Workflow Documentation**: Updated documentation to reflect `dev` as the primary integration branch

This change aligns the orchestrator with a development workflow where `dev` serves as the primary integration branch, with `main` likely reserved for production releases.

## Mode Updates - 2025-09-25 (Exclusive Branch Management)

### tarxan-orchestrator
- **EXCLUSIVE BRANCH MANAGEMENT**: Orchestrator now has sole responsibility for all branch operations
- **Simplified Agent Instructions**: Removed Git workflow instructions from task templates for downstream agents
- **Agent Workflow Simplification**: `tarxan-implementation-agent` and `tarxan-documentation-agent` now work on whatever branch they find themselves on
- **No Branch Instructions to Agents**: Orchestrator no longer tells downstream modes to checkout or pull branches
- **Centralized Git Control**: All branch creation, switching, and management operations handled exclusively by orchestrator

### Branch Management Rules Updated
- Updated documentation to reflect that only `tarxan-orchestrator` handles branch management
- Specialized agents (`tarxan-implementation-agent`, `tarxan-documentation-agent`) never switch branches
- Agents work on current branch and only commit their changes when complete

This change centralizes all Git branch management under the orchestrator, simplifying the workflow for specialized agents and preventing potential branch conflicts.