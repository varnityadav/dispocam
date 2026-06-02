# Firebase Setup Guide

## 1. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your Firebase project values:

```bash
cp .env.local.example .env.local
```

Get these values from: **Firebase Console → Project Settings → General → Your apps → Web app**

## 2. Firestore Security Rules

Go to **Firebase Console → Firestore Database → Rules** and set:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ This allows open read/write. For production, add proper security rules with authentication.

## 3. Storage Security Rules

Go to **Firebase Console → Storage → Rules** and set:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ This allows open read/write. For production, add proper security rules.

## 4. Firestore Indexes (Optional)

A composite index is **not required** with the current code — photos are sorted client-side. If you want to add `orderBy` back to the query later, create a composite index:

**Firebase Console → Firestore Database → Indexes → Add:**

- Collection: `photos`
- Fields: `event_id` (Ascending), `created_at` (Descending)
