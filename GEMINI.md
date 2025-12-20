# GEMINI.md - Project Analysis for Orca AI Chat Plugin

This document provides a comprehensive overview of the "Orca AI Chat Plugin" project, intended as an instructional context for AI-assisted development.

## 1. Project Overview

This project is a plugin for the "Orca Note" application. Its primary function is to provide an AI-powered chat panel within the Orca UI. The plugin is built as a modern web-based library using **TypeScript**, **React**, and **Vite**.

### Core Functionality:

*   **AI Chat Interface**: A React-based chat panel (`AiChatPanel.tsx`) allows users to interact with an AI model.
*   **OpenAI API Integration**: It communicates with an OpenAI-compatible backend to get chat completions and supports streaming responses.
*   **Tool Usage**: The AI can use tools to interact with the Orca application's data. Two tools are currently implemented:
    *   `searchBlocksByTag`: Allows the AI to search for notes based on tags.
    *   `searchBlocksByText`: Allows the AI to search for notes based on their content.
*   **Context Awareness**: The plugin can build a "context" from the host application (e.g., currently open notes) to provide more relevant AI responses.

### Architecture:

*   **Plugin Lifecycle**: The plugin's entry point is `src/main.ts`, which exports `load` and `unload` functions. These are called by the Orca application to initialize and terminate the plugin.
*   **Host Environment**: The plugin operates within a host environment provided by the Orca application. It interacts with the host through a global `orca` object, which exposes a rich and well-documented API (`src/orca.d.ts`).
*   **External Dependencies**: The plugin relies on the host environment to provide `React` and `Valtio` as global objects. These are configured as external dependencies in `vite.config.ts` and will not be bundled with the plugin's output.
*   **UI Components**: The UI is built with React components, with `src/views/AiChatPanel.tsx` being the main component.

## 2. Building and Running

The project's build and development scripts are defined in `package.json`.

*   **Install Dependencies**:
    ```bash
    npm install
    ```

*   **Run Development Server**: This command starts a Vite development server, likely for hot-reloading during development within the Orca application.
    ```bash
    npm run dev
    ```

*   **Build for Production**: This command first runs the TypeScript compiler (`tsc`) to check for type errors and then uses Vite to bundle the plugin into a single JavaScript file (`dist/index.js`).
    ```bash
    npm run build
    ```

*   **Preview Production Build**: This command can be used to locally preview the production build.
    ```bash
    npm run preview
    ```

## 3. Development Conventions

*   **Language**: The project is written in **TypeScript**.
*   **UI Framework**: The UI is built using **React** with functional components and hooks.
*   **State Management**: The project uses **Valtio** for state management, leveraging the `useSnapshot` hook to react to state changes.
*   **Host API Interaction**: All interactions with the Orca application (e.g., showing notifications, invoking commands, accessing data) should go through the global `orca` object. The extensive type definitions in `src/orca.d.ts` provide excellent guidance and autocompletion for this API.
*   **Plugin Entry Point**: The main entry point for the plugin is `src/main.ts`. All initialization logic (e.g., registering UI, settings, commands) should be triggered from the `load` function. Cleanup logic should be placed in the `unload` function.
*   **Styling**: Component styles are defined inline using JavaScript objects. The UI leverages CSS variables provided by the Orca host for theming (e.g., `var(--orca-color-bg-1)`).
