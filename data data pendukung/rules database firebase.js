rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Fungsi Cek Otoritas Admin Resmi Vipercell
    function isAdmin() {
      return request.auth != null && (
        request.auth.token.email == "vipercell.id@gmail.com" || 
        request.auth.token.email == "viperdev4@gmail.com" ||
        request.auth.token.email == "millertipak63@gmail.com" ||
        request.auth.token.email == "vipercell@bot.id"
      );
    }

    // =========================================================
    // RULES ROOT (PRODUCTION - VIPERCELL V25.1)
    // =========================================================
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if isAdmin();
    }

    match /device_locks/{deviceId} {
      allow read, write: if request.auth != null;
      allow read, write: if isAdmin();
    }

    match /deleted_accounts/{userId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /payment_mutations/{mutationId} {
      allow read, create, update: if true;
      allow delete: if isAdmin();
    }

    match /orders/{orderId} {
      // Siapa pun bisa membaca (untuk fitur lacak) & membuat order baru (Checkout)
      allow read, create: if true;
      
      // LOGIKA KEAMANAN UPDATE ORDER (MENDUKUNG APPS SCRIPT REST API, PEMBATALAN USER & VAULT AUTO-DELIVERY)
      allow update: if isAdmin() || (
        resource.data.status != "SUCCESS" && (
          request.resource.data.status == "SUCCESS" ||
          request.resource.data.status == "PAID" ||
          request.resource.data.status == "EXPIRED" ||
          request.resource.data.status == "CANCELLED"
        )
      ) || (
        request.auth != null &&
        resource.data.status == "SUCCESS" &&
        (!("adminReply" in resource.data) || resource.data.adminReply == "")
      );
      
      allow delete: if isAdmin();
    }

    match /stocks/{stockId} {
      allow read, write: if isAdmin();
      allow read, update: if request.auth != null;
    }

    match /products/{productId} {
      allow read: if true;
      allow write: if isAdmin();
      allow update: if request.auth != null;
    }

    match /promos/{promoId} {
      allow read: if true;
      allow write: if isAdmin();
      allow update: if request.auth != null &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['usedCount']);
    }

    match /settings/{settingId} {
      allow read: if true;
      allow write: if isAdmin();
      allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lastPaymentMutation', 'lastPaymentDetected', 'lastPaymentTimestamp', 'lastPaymentApp']);
    }

    match /reviews/{reviewId} {
      allow read, create: if true;
      allow update, delete: if isAdmin();
    }

    match /chats/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if isAdmin();
    }
  }
}