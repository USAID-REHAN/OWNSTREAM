# Postman collection

`Ownstream_API.postman_collection.json` holds every backend request built so far, grouped by module:
Login, F1 Profile, F2 Host (no login), F2 Devices, F4 Stream profiles, F6 Conversations and F7 Personas.

## How to use it

1. In Postman, click **Import** and choose `Ownstream_API.postman_collection.json`.
2. Create an environment named **Ownstream Local** with these variables:

   | Variable | Value |
   |---|---|
   | `baseUrl` | `http://localhost:3000/api` |
   | `supabaseUrl` | the Supabase Project URL |
   | `anonKey` | the Supabase anon (publishable) key |
   | `token` | leave empty; the Login request fills it |

3. Start the server (`npm run dev:server` from the repository root).
4. Run **Login** with a test user's email and password. Every other request then sends `Authorization: Bearer {{token}}`.
5. For requests with `:id`, copy an ID from the matching GET request.

The environment is not committed because it holds keys. Never put keys or passwords in the collection itself.

## Pairing a test host

1. Run **POST /host/pairing-code** and note `code` and `pairingSecret`.
2. Run **POST /devices/pair** with that code (logged in as the user).
3. Run **GET /host/pairing-status/:code** with the code and the `X-Pairing-Secret` header. The reply holds the device token, shown only once.
