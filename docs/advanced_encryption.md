# Advanced Encryption & Secure Storage: Zero-Knowledge Vault

## Goal Description
To provide strict privacy and secure data exchange, the system generates a unique "password string" containing the binary data instead of leaving the binary raw. If a user opts in, this generated string handles securely storing and retrieving the binary content. It acts as an encryption key/reference that prevents anyone from reverse-engineering the data without authorization.

## Proposed Strategy: "Zero-Knowledge" Client-Side Vault
To stay true to the "strict privacy" narrative without requiring a complex cloud backend (which could compromise privacy if intercepted or breached), we utilize a **Zero-Knowledge Architecture** directly within the terminal, storing data in the browser's secure `localStorage` sandbox.

### 1. Generating the Key (`Web Crypto API`)
**Simple terms:** Think of the "Web Crypto API" as a highly secure, unpickable digital padlock factory built right into your internet browser (like Chrome or Firefox).
- When you tell the console to save your message (e.g. `stash hello my secret`), the machine converts your text down into the dots, dashes, and binary (1s and 0s). 
- Then, our padlock factory makes a brand new, random padlock. It also cuts a single matching key for it (which looks like a password: `TS64-ABCD-1234`).

### 2. Deep Encryption & Storage (`localStorage`)
**Simple terms:** "Deep Encryption" is taking your binary 1s and 0s and putting them through a paper shredder. But a very special shredder where the pieces can magically re-assemble themselves *ONLY* if you use the correct key.
- The shredded, scrambled mess is completely unreadable and makes no sense to anyone looking at it. This is your scrambled message.
- "localStorage" is like a tiny, secret safety deposit box hidden inside your specific web browser on your specific computer. We put the scrambled, shredded message into this box.
- So, even if a super-hacker steals your computer and pries open the secret box (`localStorage`), all they will find is the shredded mess! They can't read it because they don't have the password key.

### 3. Decryption and Retrieval (`unlock`)
**Simple terms:** This is the reverse process where you get your message back safely.
- You pull out the key we gave you and type `unlock TS64-ABCD-1234`.
- The system grabs the scrambled mess out of the `localStorage` safety deposit box.
- It sees your correct key, magically un-shreds the messy code back into the proper 1s and 0s (binary).
- Finally, it translates those 1s and 0s all the way back into English for you to read on the screen!

## Local Backup & Restoration (Export / Import)
To prevent irreversible data loss if the browser cache is wiped, the system includes offline functionality.
- **Exporting**: Users can trigger a physical file download (`.ts64`) containing their precise encrypted safety deposit box. The file itself is completely safe to store anywhere, as it only houses the securely scrambled mathematical AES-GCM string.
- **Importing (Drag & Drop)**: If a user migrates to a different browser or loses their `localStorage` cache, they can physically drag and drop their `.ts64` file into the Terminal window. The system instantly parses the AES blob back into the local safety deposit box exactly as it was, making it ready to be unlocked with their key.

## Terminal Commands Integration
1. **`stash <string>`**: Converts the English string into morse/decimal/binary, encrypts the binary, stores it locally, and provides the password key to the user.
2. **`export <password>`**: Downloads a permanent offline copy of your local encrypted data (.ts64 format). 
3. **`import` (Visual)**: Drag and drop a `.ts64` backup file into the website to restore the locker.
4. **`purge`**: Immediately deletes and permanently clears all encrypted payload chunks currently stored in the browser's `localStorage` safety deposit boxes.
5. **`unlock <password>`**: Takes the password key, retrieves the encrypted binary from the database (or from a restored backup), decrypts it, and decodes it back to English.
