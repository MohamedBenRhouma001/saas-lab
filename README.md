# SaaS Feedback System

A web-based GraphQL service for collecting and managing user feedback on SaaS products, with web scraping capabilities powered by Puppeteer.

## Getting Started

### Prerequisites
- Node.js (version 16 or higher)

### Installation
1. Clone this repository:
   ```bash
   git clone <repository-url>
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```

## Features

### GraphQL Playground
- **URL**: `http://localhost:4000`
- Perform queries and mutations for:
  - Users
  - Products
  - Feedback
  - Scraped reviews
  - Scraped products

### Web Scraping Endpoints
- **scrapeReviews**
  - Accepts a URL containing reviews.
  - Requires HTML elements with `.review`, `.rating`, and `.comment` classes.
- **scrapeProducts**
  - Accepts a product listing URL.
  - Uses custom heuristics and Sephora-specific selectors:
    - `.ProductTile-content`
    - `.css-1ma869u`
    - `.css-1f35s9q`

### Feedback Management
- **createUser**: Create a new user.
- **createProduct**: Add a new product.
- **submitFeedback**: Submit feedback (requires valid `userId` and `productId`).
- **feedbacks**: Query feedback for a given `productId`.

## Web Scraping: Local Testing
1. Place `dior-product-list.html` and `dior-product-reviews.html` in the project root.
2. Start a local server:
   ```bash
   python -m http.server 8000
   ```
3. Test with:
   - `scrapeProducts`: `http://localhost:8000/dior-product-list.html`
   - `scrapeReviews`: `http://localhost:8000/dior-product-reviews.html`
4. For production URLs (e.g., `https://www.sephora.com/brand/dior/all`):
   - Check compliance with `robots.txt`.
   - Inspect browser logs for scraping issues.

## Submitting Feedback (Examples)

### Create a User
```graphql
mutation {
  createUser(username: "testUser", email: "test@example.com") {
    id
  }
}
```

### Add a Product
```graphql
mutation {
  createProduct(name: "Dior Addict Lip Glow Balm", description: "15 Colors") {
    id
  }
}
```

### Submit Feedback
```graphql
mutation {
  submitFeedback(userId: "<user-id>", productId: "<product-id>", rating: 5, comment: "Great product!") {
    id
    rating
    comment
  }
}
```

### Retrieve Feedback
```graphql
query {
  feedbacks(productId: "<product-id>") {
    id
    rating
    comment
    user { username }
    product { name }
  }
}
```

> **Note**: Ensure both `userId` and `productId` are valid before submitting feedback. Invalid IDs will result in errors.

## Automated Scraping (Cron Job)
- A scheduled job runs daily at midnight to scrape product data.
- **Default URL**: `http://localhost:8000/dior-product-list.html`
- Update `sourceUrl` for production environments.
- Timeout: 60 seconds.
- Fallback strategy: Uses `domcontentloaded` event.

## Dependencies
- `@apollo/server`: GraphQL server setup
- `graphql`: Schema and resolvers
- `puppeteer`: Web scraping (uses modern headless mode)
- `cheerio`: HTML parser
- `uuid`: Unique ID generator
- `node-cron`: Task scheduling

## Important Notes
- **Data Storage**: Data is stored in-memory. For persistent storage, integrate a database like MongoDB.
- **Scraper**: Uses Puppeteer’s updated headless mode (`headless: "new"`).
- **Custom Scraping Logic**: Includes Sephora-specific selectors.
- **Compliance**: Ensure compliance with website terms and `robots.txt` when scraping.
- **Anti-Scraping Mitigation**: Use services like ScrapingBee or proxies to avoid blocks.