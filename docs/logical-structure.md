# Lecture Tools Logical Structure
This document visualises the observable behaviour of Lecture Tools. Each diagram focuses on the choices available to administrators, instructors, and learners, together with the resulting system reactions. No implementation details are described—only the logical steps that occur when a person interacts with the platform.

## 1. End-to-End Overview

```mermaid
flowchart TD
    A[Platform Startup] --> B{Who is interacting?}
    B -->|Administrator| C[Configure & Monitor]
    B -->|Instructor| D[Ingest & Curate Lectures]
    B -->|Learner| E[Consume Published Content]

    C --> C1[Launch services]
    C --> C2[Maintain catalogue]
    C --> C3[Supervise background jobs]

    D --> D1[Upload media]
    D --> D2[Track processing]
    D --> D3[Publish or revise]

    E --> E1[Browse catalogue]
    E --> E2[Stream audio & transcript]
    E --> E3[Download slides & notes]

    subgraph Shared Systems
        S1[Progress Tracker]
        S2[Persistent Storage]
        S3[Dependency Validator]
    end

    C1 --> S3
    C2 --> S2
    C3 --> S1
    D1 --> S2
    D2 --> S1
    D3 --> S2
    E1 --> S2
    E2 --> S1
    E3 --> S2
```

The remainder of this document expands each branch so that every possible route a user can take is charted.

## 2. Administrator Journey

### 2.1 Bringing the platform online

```mermaid
flowchart LR
    A[Invoke startup command] --> B[Load configuration]
    B --> C{Dependencies available?}
    C -->|No| D[Report missing tools & stop]
    C -->|Yes| E[Prepare storage & working dirs]
    E --> F{Storage ready?}
    F -->|No| G[Report storage error & wait for fix]
    F -->|Yes| H[Start background services]
    H --> I[Start web server]
    I --> J[Administrator dashboard available]
```

### 2.2 Managing the catalogue and jobs

```mermaid
flowchart TD
    A[Open admin dashboard / CLI] --> B{Action}
    B -->|Create structure| C[Add class/module/lecture]
    B -->|Edit details| D[Update metadata]
    B -->|Remove content| E[Confirm cascade delete]
    B -->|Monitor jobs| F[Inspect tracker]

    C --> C1[Validate hierarchy]
    C1 --> C2[Persist catalogue]
    C2 --> C3[Notify active sessions]

    D --> D1[Validate changes]
    D1 --> D2[Persist metadata]
    D2 --> D3[Refresh UI panels]

    E --> E1[Warn about dependent artefacts]
    E1 --> E2{Confirmed?}
    E2 -->|No| B
    E2 -->|Yes| E3[Delete records & artefacts]
    E3 --> E4[Update tracker & UI]

    F --> F1[Review running/queued jobs]
    F1 --> F2{Issue spotted?}
    F2 -->|No| B
    F2 -->|Yes| F3[Trigger retry or escalate]
```

Administrators can loop through these options without restarting the platform. Every decision either updates storage immediately or guides the next corrective action.

## 3. Instructor Journey

### 3.1 Selecting ingestion paths

```mermaid
flowchart TD
    A[Open instructor dashboard] --> B[Fetch latest catalogue & job statuses]
    B --> C{Choose lecture}
    C --> D[Review outstanding tasks]
    D --> E{What to do?}
    E -->|Upload media| F[Choose audio/slides]
    E -->|Retry failed job| G[Request retry]
    E -->|Adjust lecture info| H[Edit metadata]
    E -->|Publish/unpublish| I[Toggle visibility]

    F --> F1[Store uploads in lecture directory]
    F1 --> F2[Register processing steps]
    F2 --> J[Processing pipeline]

    G --> G1[Reset job status]
    G1 --> J

    H --> H1[Validate edits]
    H1 --> H2[Persist changes]
    H2 --> B

    I --> I1[Update publication state]
    I1 --> B
```

### 3.2 Processing pipeline reactions

```mermaid
stateDiagram-v2
    [*] --> Staged
    Staged --> AudioMastering: Audio queued
    AudioMastering --> Transcript: Mastered audio ready
    AudioMastering --> FailedMastering: Error encountered
    FailedMastering --> Staged: Instructor retries
    Transcript --> Slides: Slides available
    Transcript --> ReadyForReview: No slides provided
    Transcript --> FailedTranscription: Error encountered
    FailedTranscription --> Transcript: Instructor retries
    Slides --> ReadyForReview: Conversion complete
    Slides --> FailedSlides: Error encountered
    FailedSlides --> Slides: Instructor retries
    ReadyForReview --> Published: Instructor publishes
    Published --> Archived: Instructor retracts or supersedes
```

When the **Slides** state transitions to **ReadyForReview**, the system stores a Markdown document containing the OCR results along with rendered slide images. The web experience offers a single ZIP download bundling both assets for students and instructors.

Every transition updates the unified progress tracker so that instructors immediately see where a lecture stands and what recovery options exist.

## 4. Learner Journey

### 4.1 Navigating the portal

```mermaid
flowchart TD
    A[Enter learner portal] --> B[Load published catalogue]
    B --> C{Select lecture}
    C -->|Back to catalogue| B
    C -->|Open lecture| D[Display lecture view]
    D --> E{Desired action}
    E -->|Stream audio| F[Play mastered audio]
    E -->|Follow transcript| G[Sync transcript segments]
    E -->|Inspect slides| H[Open slide gallery]
    E -->|Download materials| I[Bundle download]
    E -->|Mark complete| J[Update progress]

    F --> F1[Continuous playback]
    F1 --> G
    G --> G1[Jump by timestamp]
    H --> H1[Zoom individual slides]
    I --> I1[Deliver archive]
    J --> B
```

### 4.2 Handling unavailable items

```mermaid
flowchart LR
    A[Lecture opened] --> B{Are all artefacts ready?}
    B -->|Yes| C[Show full experience]
    B -->|No| D[Display placeholders & status]
    D --> E{Which artefact missing?}
    E -->|Audio| F[Disable playback, show retry ETA]
    E -->|Transcript| G[Hide sync controls, show notice]
    E -->|Slides| H[Show conversion pending message]
    F --> I[Await tracker update]
    G --> I
    H --> I
    I --> B
```

Learners continuously poll the tracker so that newly available media appears without reloading the page.

## 5. Cross-Cutting Safeguards

### 5.1 Validation and dependency checks

```mermaid
flowchart TD
    A[User initiates action] --> B[Validate input]
    B --> C{Valid?}
    C -->|No| D[Reject with guidance]
    C -->|Yes| E[Check external dependencies]
    E --> F{Tools & services ready?}
    F -->|No| G[Queue job & notify admins]
    F -->|Yes| H[Execute action]
    G --> I[Wait for resolution]
    I --> F
    H --> J[Log success in tracker]
```

### 5.2 Error recovery loop

```mermaid
flowchart LR
    A[Failure reported] --> B[Show actionable message]
    B --> C{User role}
    C -->|Instructor| D[Retry from dashboard]
    C -->|Administrator| E[Resolve dependency/storage issue]
    C -->|Learner| F[Wait or switch lecture]
    D --> G[Job re-queued]
    E --> H[Fix environment]
    F --> I[Monitor tracker notifications]
    G --> J[Tracker updates all clients]
    H --> J
    I --> J
    J --> K{Problem solved?}
    K -->|Yes| L[Resume normal flow]
    K -->|No| B

