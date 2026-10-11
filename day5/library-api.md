# Library API Design

A REST API for a library's **books** resource. All requests and responses use JSON.

- Base path: `/api`
- Resource: `books`

## Book object

- `id` (number): unique identifier, set by the server
- `title` (string): the book's title
- `author` (string): the author's full name
- `isbn` (string): the book's ISBN
- `year` (number): year of publication
- `available` (boolean): whether the book can be borrowed

## Endpoints

### 1. List all books

- **Method:** `GET`
- **Path:** `/api/books`
- **Description:** Returns every book in the library.
- **Request body:** none
- **Success status code:** `200 OK`

### 2. Get one book

- **Method:** `GET`
- **Path:** `/api/books/{id}`
- **Description:** Returns the single book with the given id.
- **Request body:** none
- **Success status code:** `200 OK`

### 3. Create a book

- **Method:** `POST`
- **Path:** `/api/books`
- **Description:** Adds a new book to the library.
- **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "isbn": "9780385474542",
  "year": 1958,
  "available": true
}
```

- **Success status code:** `201 Created`

### 4. Update a book

- **Method:** `PUT`
- **Path:** `/api/books/{id}`
- **Description:** Replaces the details of an existing book.
- **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "isbn": "9780385474542",
  "year": 1958,
  "available": false
}
```

- **Success status code:** `200 OK`

### 5. Delete a book

- **Method:** `DELETE`
- **Path:** `/api/books/{id}`
- **Description:** Removes the book with the given id from the library.
- **Request body:** none
- **Success status code:** `204 No Content`

### 6. List books by an author

- **Method:** `GET`
- **Path:** `/api/books?author={name}`
- **Example:** `/api/books?author=Chinua%20Achebe`
- **Description:** Returns only the books written by the given author.
- **Request body:** none
- **Success status code:** `200 OK`

## Error codes

### 400 Bad Request

- **Meaning:** The request is invalid or malformed.
- **Example:** `POST /api/books` is sent without a `title`, or with `year` as the text `"nineteen"` instead of a number.
- **Example response:**

```json
{
  "error": "title is required"
}
```

### 404 Not Found

- **Meaning:** The requested book does not exist.
- **Example:** `GET /api/books/9999` is sent but no book has the id `9999`.
- **Example response:**

```json
{
  "error": "Book with id 9999 not found"
}
```
