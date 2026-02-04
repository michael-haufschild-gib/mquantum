# M-Dimension Platform Vision: "The CodePen of Hyper-Geometry"

## 1. Executive Summary
This document outlines the roadmap for transforming the M-Dimension standalone visualizer into a full-stack community platform. Drawing inspiration from **CodePen** (coding), **Suno/Udio** (generative audio), and **ShaderToy** (graphics), the goal is to build an ecosystem where users not only create but share, remix, and curate N-dimensional visualizations.

The platform will move from a "Single Player Tool" to a "Social Creative Network."

---

## 2. The Feature Matrix (Kano Model)

### 🔴 The Baseline (Must-Haves)
*If these are missing or broken, the product is a failure. Users expect these by default.*

| Feature | Description | Why it's Critical |
| :--- | :--- | :--- |
| **Robust Auth** | Sign up/Login (Email + Social providers like GitHub/Google). | Foundation for ownership. |
| **Perfect Persistence** | Saving a scene stores *every* single parameter (camera, shaders, math, colors). Loading it restores the exact state. | Trust. If I save something and it loads differently, I will leave. |
| **"Fork" / "Remix"** | One-click button to copy another user's scene into my editor to modify. | The engine of viral creativity (CodePen's core loop). |
| **Auto-Thumbnails** | When saving, the client generates a screenshot of the viewport. | A gallery of text titles is unbrowsable. We need visuals. |
| **My Library** | A dashboard to view, delete, and edit visibility (Public/Private) of my creations. | Basic asset management. |
| **Responsive Player** | A lightweight "View Mode" (no sidebar controls) for sharing links. | Mobile users need to see the art without the UI clutter. |

### 🟡 The Performance/Flow (Should-Haves)
*The better implementation of these, the higher the user satisfaction. Linear correlation.*

| Feature | Description | Impact |
| :--- | :--- | :--- |
| **Global Feed (Hot/New)** | Algorithms to surface "Trending" scenes based on views/likes/forks. | Keeps the homepage fresh and encourages return visits. |
| **Collections/Playlists** | Users can group scenes (e.g., "Hypercubes", "Chill Vibes", "Glitch Art"). | allows for curation and storytelling. |
| **Instant Search** | Search by tags, title, or username with immediate results. | Discoverability. |
| **Profile Pages** | A public portfolio showing a user's bio, avatar, and best creations. | Ego and identity building. |
| **Deep Linking** | URLs that update as you move the camera (optional) or stable short-links. | Ease of sharing specific perspectives. |

### 🟢 The Delighters ("Wow" Factors)
*Features users don't expect, but will be amazed by. Distinguishes us from a basic MVP.*

| Feature | Description | The "Wow" Effect |
| :--- | :--- | :--- |
| **Animated Previews** | Hovering over a thumbnail in the feed plays a 2-second WebM/GIF loop of the motion. | Makes the feed feel alive (like YouTube/Suno). |
| **The "Remix Tree"** | A visual graph showing the genealogy of a scene (Original -> User A's Fork -> User B's Fork). | Shows the evolution of an idea through the community. |
| **Interactive Embeds** | An `<iframe>` widget to embed a live, interactive 3D scene on external blogs/Notion. | Viral marketing tool. "Look at this cool thing I made." |
| **CC0 / Asset Export** | Button to "Export as 4k Wallpaper" or "Export Loop to Video." | Moves value off-platform (Utility). |
| **Live Collaboration** | Two users in the same editor session (Google Docs style). | Technical marvel, massive for teaching/jamming. |

---

## 3. Core User Journeys

### Journey A: The "Explorer" (Passive Consumer)
**Goal:** Be visually stimulated and find cool visuals without effort.
1.  **Land:** User arrives at Homepage. Sees a grid of beautiful, moving thumbnails ("Trending").
2.  **View:** Clicks a thumbnail. The app loads in "Cinema Mode" (Controls hidden). The visualization starts automatically.
3.  **Interact:** User rotates the object with mouse/touch.
4.  **Pivot:** User clicks the creator's avatar to see more of their style, or clicks a related tag.

### Journey B: The "Remixer" (The Super-User)
**Goal:** Take an existing cool idea and make it their own.
1.  **Discover:** Finds a "Golden Hypercube" scene in the Global Feed.
2.  **Inspect:** Clicks "Edit / View Source." The Sidebar opens, showing the exact parameters used.
3.  **Tweak:** Changes the color palette to "Neon Cyberpunk" and increases rotation speed.
4.  **Save:** Clicks "Save."
    *   *System Prompt:* "You are editing someone else's scene. Create a fork?"
    *   *Action:* User confirms.
5.  **Publish:** User adds a title "Cyber-Cube," tags it `#neon`, and publishes.
6.  **Reward:** The original scene now shows "1 Fork" (The user feels part of a chain).

### Journey C: The "Curator" (Power User)
**Goal:** Organize content for others.
1.  **Collection:** User creates a List called "Meditation Visuals."
2.  **Search:** Searches for "Slow", "Blue", "Smooth".
3.  **Add:** Adds 5 different scenes from 5 different authors to the list.
4.  **Share:** Shares the link `mdimension.app/collection/meditation` on Twitter.

---

## 4. Technical Implications for Backend (Laravel/Inertia)

To support these stories, the backend must prioritize:

1.  **JSON Storage (MySQL):** The `scenes` table must efficiently store the massive JSON configuration blob.
2.  **Asset Storage (S3/R2):** We cannot store images in the DB. We need an efficient pipeline to upload thumbnail blobs generated by the HTML5 Canvas to an S3-compatible bucket.
3.  **Full-Text Search:** Implementation of Laravel Scout (Meilisearch or database driver) to index titles, descriptions, and tags.
4.  **Polymorphic Relations:** For "Likes" and "Comments" (standard Laravel pattern).
5.  **Performance Caching:** The "Trending" feed cannot be calculated on every page load. We need Redis caching for the homepage feed.

---

## 5. Success Metrics
*   **Fork Rate:** % of scenes created that are forks of others (high = healthy community).
*   **Time on Site:** If the "Explorer" journey works, this should remain high.
*   **Save Conversion:** % of anonymous users who sign up specifically to save a scene they just tweaked.
