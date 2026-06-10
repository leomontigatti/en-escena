# Coding Standards

These standards use Matt Pocock's `course-video-manager` Sandcastle standards as
the reference model, adapted to this repo. Keep the principles; add framework-
specific rules only when the repo actually adopts that framework or pattern.

## Testing

Tests should verify behavior through public interfaces, not implementation
details. Code can change internally; tests should fail only when observable
behavior changes.

Prefer integration-style tests that exercise real code paths through the public
API. Test names should describe what the system does, not how it does it.

Mock at system boundaries only:

- External APIs
- Time and randomness
- File systems, databases, or services when a real instance is not practical

Do not mock our own internal collaborators. If code is hard to test without
mocking internal modules, redesign the interface.

Avoid tests that simply restate trivial implementation details, such as a
one-line string concatenation or direct mapping. These tests add little
confidence and tend to break during harmless refactors.

## TDD Workflow

When using TDD, work in vertical slices:

1. Write one failing test.
2. Implement only enough to pass it.
3. Repeat with the next behavior.
4. Refactor only while green.

Do not write a large suite of imagined tests before touching implementation.
Each test should respond to what the previous slice revealed.

## Interface Design

Prefer deep modules: small public interfaces that hide meaningful complexity.
Avoid shallow modules that expose many methods or parameters while doing little
inside.

Scrutinize optional parameters. They are a common source of bugs by omission.
Prefer a smaller, explicit interface over broad backwards-compatible parameter
bags when correctness is at stake.

Design for testability:

- Accept dependencies instead of constructing external dependencies internally.
- Return values where practical instead of hiding behavior behind side effects.
- Keep public surface area small so behavior is easier to exercise.

## Style

Choose clarity over cleverness. Prefer explicit control flow over compact code
that is harder to inspect, especially nested ternaries and dense conditionals.

Use comments only when they explain non-obvious intent or constraints. Avoid
comments that narrate what the next line already says.
