# Organize app code by product surface

We will organize UI and route code first by product surface (`admin`, `portal`, `auth`, `audit`, `judging`) and only then by domain resource. Admin and portal views often share domain entities but differ in permissions, copy, states and allowed actions, so shared code should stay at field primitives or domain services rather than full cross-surface screens.

Event-scoped rules and master data are described in the domain as Bases del evento. Concrete modules should use direct resource names such as `event-categories`, `event-prices`, `event-modalities` and `event-schedule-blocks`; broader `event-bases` names are reserved for aggregators that genuinely coordinate several of those resources.
