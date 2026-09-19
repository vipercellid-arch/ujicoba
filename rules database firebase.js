rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Fungsi Cek Admin (Sangat Matang)
    function isAdmin() {
      return request.auth != null && (
        request.auth.token.email == "vipercell.id@gmail.com" || 
        request.auth.token.email == "millertipak63@gmail.com"
      );
    }

    // =========================================================
    // RULES ROOT (PRODUCTION)
    // =========================================================
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if isAdmin();
    }
    match /orders/{orderId} {
      allow read, create: if true;
      allow update: if true; // Mengizinkan Apps Script (MacroDroid) mengupdate status otomatis
      allow delete: if isAdmin();
    }
    match /stocks/{stockId} {
      allow read, write: if isAdmin();
    }
    match /products/{productId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    match /promos/{promoId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    match /settings/{settingId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    match /reviews/{reviewId} {
      allow read, create: if true;
      allow update, delete: if isAdmin();
    }
    match /chats/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if isAdmin();
    }

    // =========================================================
    // RULES DEVELOPMENT (WORKSPACE)
    // =========================================================
    match /artifacts/{appId}/public/data/users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if isAdmin();
    }
    match /artifacts/{appId}/public/data/orders/{orderId} {
      allow read, create, update: if true;
      allow delete: if isAdmin();
    }
    match /artifacts/{appId}/public/data/stocks/{stockId} {
      allow read, write: if isAdmin();
    }
    match /artifacts/{appId}/public/data/products/{productId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    match /artifacts/{appId}/public/data/promos/{promoId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    match /artifacts/{appId}/public/data/settings/{settingId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    match /artifacts/{appId}/public/data/reviews/{reviewId} {
      allow read, create: if true;
      allow update, delete: if isAdmin();
    }
    match /artifacts/{appId}/public/data/chats/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if isAdmin();
    }
  }
}