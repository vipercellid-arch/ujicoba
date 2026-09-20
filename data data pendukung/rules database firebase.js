rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Fungsi Cek Admin Manusia (Bebas Melakukan Apapun)
    function isAdmin() {
      return request.auth != null && (
        request.auth.token.email == "vipercell.id@gmail.com" || 
        request.auth.token.email == "millertipak63@gmail.com" ||
        request.auth.token.email == "vipercell@bot.id"
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
      // Siapapun bisa baca (untuk fitur lacak) & membuat order baru (Checkout)
      allow read, create: if true;
      
      // LOGIKA KEAMANAN TINGKAT TINGGI UNTUK APPS SCRIPT (REST API)
      allow update: if isAdmin() || (
          // 1. Permintaan update hanya menyentuh field 'status'
          request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status']) 
          && 
          // 2. Status saat ini di database BUKAN SUCCESS (mencegah double eksekusi)
          resource.data.status != "SUCCESS"
          &&
          // 3. Status baru yang dikirim HANYA BOLEH bernilai SUCCESS atau EXPIRED
          (request.resource.data.status == "SUCCESS" || request.resource.data.status == "EXPIRED")
      );
      
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
    // RULES DEVELOPMENT (WORKSPACE) - Jika Anda menggunakannya
    // =========================================================
    match /artifacts/{appId}/public/data/users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if isAdmin();
    }
    match /artifacts/{appId}/public/data/orders/{orderId} {
      allow read, create: if true;
      allow update: if isAdmin() || (
          request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status']) 
          && resource.data.status != "SUCCESS"
          && (request.resource.data.status == "SUCCESS" || request.resource.data.status == "EXPIRED")
      );
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