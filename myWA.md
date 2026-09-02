# 📋 PRD & Technical Design: WhatsApp-Integrated Task Management & Kanban Platform

## 1. Overview & Objective
Build a full-stack task management and messaging platform using **Node.js**, **whatsapp-web.js (wweb.js)**, and a **Modern Web Frontend (React/Next.js)**. 

The system syncs WhatsApp messages (1-on-1 and Group chats) in real time and provides a web dashboard where users can convert any message into an actionable Task. Tasks can be assigned to single/multiple members, given due dates, and tracked on both a **Chat-Specific Task Sidebar** and an **All-Chats Kanban Board**. Changes made in the web dashboard trigger automated notification updates back into the respective WhatsApp chats.

---

## 2. Core Features & Capabilities

### A. WhatsApp Integration Layer
* **Session Persistence:** Use `LocalAuth` in `wweb.js` so QR code scan is required only once.
* **Message Syncing:** Intercept inbound/outbound messages and save chats, contacts, and message logs to the local DB.
* **Outbound Notifications:** Auto-send WhatsApp messages when tasks are created, assigned, or marked completed.
* **WhatsApp Mentions:** Mentions assigned group members (`@phone_number`) via `wweb.js` options.

### B. Task Management Engine
* **Message to Task:** Convert any synced message into a Task record with 1 click.
* **Flexible Assignment:**
  * **Direct Chat:** Assign to self or contact.
  * **Group Chat:** Assign to one or multiple group participants.
* **Status Pipeline:** `TODO` ➔ `IN_PROGRESS` ➔ `DONE`.
* **Due Date Tracking:** Set target completion dates with reminder triggers.

### C. UI / UX Views
1. **Chat & Task Dual View:**
   * **Left:** Active WhatsApp chat list & chat history.
   * **Right Drawer/Sidebar:** Tasks pinned specifically to the currently selected chat.
2. **Global Kanban Board:**
   * Trello/Jira style Drag & Drop board across all chats.
   * Filterable by Chat, Assignee, Status, and Due Date.

---

## 3. Data Model (Schema)

```
[Chats] 1 --- * [Messages] 1 --- 0..1 [Tasks] 1 --- * [TaskAssignees]
  |                                     |
  +------------ * [Tasks] --------------+
```

### Database Tables / Collections

#### 1. `chats`
* `id` (PK, string - WhatsApp JID: e.g. `905xxx@c.us` or `120xxx@g.us`)
* `name` (string)
* `is_group` (boolean)
* `updated_at` (timestamp)

#### 2. `contacts`
* `id` (PK, string - WhatsApp JID)
* `phone_number` (string)
* `name` (string)

#### 3. `messages`
* `id` (PK, string - WhatsApp Message ID)
* `chat_id` (FK -> `chats.id`)
* `sender_id` (FK -> `contacts.id`)
* `body` (text)
* `timestamp` (timestamp)

#### 4. `tasks`
* `id` (PK, UUID/string)
* `chat_id` (FK -> `chats.id`)
* `source_message_id` (FK -> `messages.id`, nullable)
* `title` (string)
* `description` (text, nullable)
* `status` (enum: `'TODO'`, `'IN_PROGRESS'`, `'DONE'`)
* `due_date` (timestamp, nullable)
* `created_by` (string - Contact JID)
* `created_at` (timestamp)

#### 5. `task_assignees`
* `id` (PK, UUID/string)
* `task_id` (FK -> `tasks.id`)
* `contact_id` (FK -> `contacts.id`)

---

## 4. Architecture & Data Flow

```
[ WhatsApp Server ]
       │ (WebSocket)
       ▼
[ wweb.js Client ]
       │
       ├─► (New Message) ──► [ Local Database ] ──► [ Web Socket / REST ] ──► [ React UI ]
       │                                                                            │
       └─◄ (Task Notification) ◄── [ Task Service ] ◄───────────────────────────────┘
```

1. **Inbound Path:**
   * WhatsApp receives a message.
   * `wweb.js` triggers `client.on('message_create')`.
   * Message is ingested into DB and pushed to UI via WebSockets (Socket.io).
2. **Task Creation Path:**
   * User clicks "Create Task" from a message in UI.
   * Frontend posts `POST /api/tasks` with `source_message_id`, `chat_id`, `assignees`, `due_date`.
   * API saves task, links assignees, and sends an automated update message to the corresponding WhatsApp chat:
     * *Format:* `📌 *Yeni Görev:* [Başlık]\n👤 *Atananlar:* @kullanıcı\n📅 *Bitiş:* DD/MM/YYYY`

---

## 5. Technology Stack & Packages

* **Backend Environment:** Node.js (TypeScript preferred)
* **WhatsApp Library:** `whatsapp-web.js` + `qrcode-terminal` (for initial setup)
* **Server Framework:** Express.js or NestJS
* **Realtime Engine:** Socket.io (for instant UI message/task updates)
* **Database & ORM:** PostgreSQL + Prisma ORM (or MongoDB + Mongoose)
* **Frontend Framework:** React (Next.js App Router recommended)
* **UI Components:** Tailwind CSS, Shadcn UI, Lucide Icons
* **Drag & Drop Engine:** `@hello-pangea/dnd` or `@dnd-kit`

---

## 6. Implementation Steps for Agent

### Step 1: Initialization & Environment
1. Initialize a TypeScript Node.js project.
2. Install `whatsapp-web.js` and dependencies (`puppeteer`).
3. Setup `wweb.js` client with `LocalAuth`:
   ```typescript
   import { Client, LocalAuth } from 'whatsapp-web.js';

   const client = new Client({
     authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
     puppeteer: { args: ['--no-sandbox'] }
   });
   ```

### Step 2: Ingestion & WebSockets
1. Setup DB Schema (Prisma/MongoDB).
2. Create `message_create` listener:
   * Parse `message.from`, `message.body`, `message.id`.
   * Upsert Chat and Contact records.
   * Save Message record.
   * Broadcast via Socket.io to frontend clients.

### Step 3: REST API Endpoints
Expose the following endpoints:
* `GET /api/chats` - List all active chats.
* `GET /api/chats/:chatId/messages` - Fetch history for a specific chat.
* `GET /api/chats/:chatId/tasks` - Fetch tasks linked to a specific chat.
* `POST /api/tasks` - Create a new task (and send notification via `wweb.js`).
* `PATCH /api/tasks/:id` - Update status (Kanban move) or assignees.
* `GET /api/tasks/kanban` - Fetch all tasks grouped by status (`TODO`, `IN_PROGRESS`, `DONE`).

### Step 4: Outbound WhatsApp Notification Service
Create a helper function to send formatted task alerts back to WhatsApp:
```typescript
async function sendTaskNotification(chatId: string, title: string, assigneeJids: string[]) {
  const chat = await client.getChatById(chatId);
  const mentions = await Promise.all(assigneeJids.map(jid => client.getContactById(jid)));
  
  const mentionText = mentions.map(m => `@${m.id.user}`).join(', ');
  const messageBody = `📌 *Yeni Görev Oluşturuldu*\n\n*Görev:* ${title}\n*Atanan:* ${mentionText}`;

  await chat.sendMessage(messageBody, { mentions });
}
```

### Step 5: Frontend Interface
1. Build a two-column Layout:
   * **Left:** Chat/Message timeline.
   * **Right:** Task Creation Modal + Chat-specific Task List.
2. Build a dedicated `/kanban` route:
   * Render columns for `TODO`, `IN_PROGRESS`, `DONE`.
   * Enable drag-and-drop to trigger `PATCH /api/tasks/:id`.

---

## 7. Edge Cases & Constraints to Handle
* **Puppeteer Crash:** Implement auto-restart logic for the `wweb.js` client.
* **Media Messages:** Handle audio/images gracefully (store placeholder text or media URL).
* **Ban Prevention:** Rate-limit outbound task notification messages (max 1 message per second).
* **Unsent/Deleted Messages:** Synchronize state if a WhatsApp message is deleted by sender.
