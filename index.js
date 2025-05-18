const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const { gql } = require('graphql-tag');
const { v4: uuidv4 } = require('uuid');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const cron = require('node-cron');

// In-memory storage
let users = [];
let products = [];
let feedbacks = [];
let scrapedReviews = [];
let scrapedProducts = [];

const typeDefs = gql`
  type User {
    id: ID!
    username: String!
    email: String!
  }

  type Product {
    id: ID!
    name: String!
    description: String!
  }

  type Feedback {
    id: ID!
    user: User!
    product: Product!
    rating: Int!
    comment: String!
    timestamp: String!
  }

  type ScrapedReview {
    id: ID!
    product: Product!
    source: String!
    rating: Int!
    comment: String!
    timestamp: String!
  }

  type ScrapedProduct {
    id: ID!
    name: String!
    price: String
    description: String
    source: String!
    timestamp: String!
  }

  type Query {
    user(id: ID!): User
    product(id: ID!): Product
    feedbacks(productId: ID!): [Feedback!]!
    scrapedReviews(productId: ID!): [ScrapedReview!]!
    scrapedProducts(source: String!): [ScrapedProduct!]!
    averageRating(productId: ID!): Float!
  }

  type Mutation {
    createUser(username: String!, email: String!): User!
    createProduct(name: String!, description: String!): Product!
    submitFeedback(userId: ID!, productId: ID!, rating: Int!, comment: String!): Feedback!
    scrapeReviews(productId: ID!, sourceUrl: String!): [ScrapedReview!]!
    scrapeProducts(sourceUrl: String!): [ScrapedProduct!]!
  }
`;

const resolvers = {
  Query: {
    user: (_, { id }) => users.find(u => u.id === id),
    product: (_, { id }) => products.find(p => p.id === id),
    feedbacks: (_, { productId }) => feedbacks.filter(f => f.productId === productId),
    scrapedReviews: (_, { productId }) => scrapedReviews.filter(sr => sr.productId === productId),
    scrapedProducts: (_, { source }) => scrapedProducts.filter(sp => sp.source === source),
    averageRating: (_, { productId }) => {
      const productFeedbacks = feedbacks.filter(f => f.productId === productId);
      const totalRating = productFeedbacks.reduce((sum, f) => sum + f.rating, 0);
      return productFeedbacks.length ? totalRating / productFeedbacks.length : 0;
    },
  },
  Mutation: {
    createUser: (_, { username, email }) => {
      const user = { id: uuidv4(), username, email };
      users.push(user);
      return user;
    },
    createProduct: (_, { name, description }) => {
      const product = { id: uuidv4(), name, description };
      products.push(product);
      return product;
    },
    submitFeedback: (_, { userId, productId, rating, comment }) => {
      const user = users.find(u => u.id === userId);
      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }
      const product = products.find(p => p.id === productId);
      if (!product) {
        throw new Error(`Product with ID ${productId} not found`);
      }
      const feedback = {
        id: uuidv4(),
        userId,
        productId,
        rating,
        comment,
        timestamp: new Date().toISOString(),
      };
      feedbacks.push(feedback);
      return feedback;
    },
    scrapeReviews: async (_, { productId, sourceUrl }) => {
      try {
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        await page.goto(sourceUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        const reviews = await page.evaluate(() => {
          const reviewElements = document.querySelectorAll('.review') || [];
          return Array.from(reviewElements).map(el => ({
            rating: parseInt(el.querySelector('.rating')?.textContent) || 0,
            comment: el.querySelector('.comment')?.textContent || 'No comment',
          }));
        });

        const newReviews = reviews.map(review => ({
          id: uuidv4(),
          productId,
          source: sourceUrl,
          rating: review.rating,
          comment: review.comment,
          timestamp: new Date().toISOString(),
        }));

        scrapedReviews.push(...newReviews);
        await browser.close();
        return newReviews;
      } catch (error) {
        console.error('Scraping error:', error);
        return [];
      }
    },
    scrapeProducts: async (_, { sourceUrl }) => {
      try {
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        try {
          await page.goto(sourceUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        } catch (navError) {
          console.warn(`Primary navigation failed for ${sourceUrl}: ${navError}. Trying fallback...`);
          await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        }

        const html = await page.content();
        const $ = cheerio.load(html);

        const productElements = $('div, article, section').filter((i, el) => {
          const classes = $(el).attr('class')?.toLowerCase() || '';
          return classes.includes('product') || classes.includes('item') || classes.includes('card') || classes.includes('tile');
        });

        const products = [];
        productElements.each((i, el) => {
          const name = $(el).find('[class*="name"], [class*="title"], h1, h2, h3, .css-1ma869u').first().text().trim() || 'Unknown';
          const price = $(el).find('[class*="price"], [class*="cost"], .price, .amount, .css-1f35s9q span').first().text().trim() || '';
          const description = $(el).find('[class*="description"], [class*="details"], p, .css-l6xvpz').first().text().trim() || '';
          if (name !== 'Unknown') {
            products.push({
              id: uuidv4(),
              name,
              price,
              description,
              source: sourceUrl,
              timestamp: new Date().toISOString(),
            });
          }
        });

        if (products.length === 0 && sourceUrl.includes('sephora.com')) {
          const sephoraElements = $('.ProductTile-content');
          console.log(`Found ${sephoraElements.length} Sephora product tiles`);
          sephoraElements.each((i, el) => {
            const name = $(el).find('.css-1ma869u').text().trim() || 'Unknown';
            const price = $(el).find('.css-1f35s9q span').text().trim() || '';
            const description = $(el).find('.css-l6xvpz').text().trim() || '';
            if (name !== 'Unknown') {
              products.push({
                id: uuidv4(),
                name,
                price,
                description,
                source: sourceUrl,
                timestamp: new Date().toISOString(),
              });
            }
          });
          console.log(`Extracted ${products.length} Sephora products`);
        }

        scrapedProducts.push(...products);
        await browser.close();
        return products;
      } catch (error) {
        console.error('Product scraping error:', error);
        return [];
      }
    },
  },
  Feedback: {
    user: (parent) => {
      const user = users.find(u => u.id === parent.userId);
      if (!user) {
        throw new Error(`User with ID ${parent.userId} not found for feedback ${parent.id}`);
      }
      return user;
    },
    product: (parent) => {
      const product = products.find(p => p.id === parent.productId);
      if (!product) {
        throw new Error(`Product with ID ${parent.productId} not found for feedback ${parent.id}`);
      }
      return product;
    },
  },
  ScrapedReview: {
    product: (parent) => products.find(p => p.id === parent.productId),
  },
  ScrapedProduct: {
    // No relational fields for ScrapedProduct
  },
};

cron.schedule('0 0 * * *', async () => {
  console.log('Running daily product scrape...');
  try {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    const sourceUrl = 'http://localhost:8000/dior-product-list.html';
    try {
      await page.goto(sourceUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (navError) {
      console.warn(`Cron navigation failed for ${sourceUrl}: ${navError}. Trying fallback...`);
      await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    const html = await page.content();
    const $ = cheerio.load(html);

    const productElements = $('div, article, section').filter((i, el) => {
      const classes = $(el).attr('class')?.toLowerCase() || '';
      return classes.includes('product') || classes.includes('item') || classes.includes('card') || classes.includes('tile');
    });

    const products = [];
    productElements.each((i, el) => {
      const name = $(el).find('[class*="name"], [class*="title"], h1, h2, h3, .css-1ma869u').first().text().trim() || 'Unknown';
      const price = $(el).find('[class*="price"], [class*="cost"], .price, .amount, .css-1f35s9q span').first().text().trim() || '';
      const description = $(el).find('[class*="description"], [class*="details"], p, .css-l6xvpz').first().text().trim() || '';
      if (name !== 'Unknown') {
        products.push({
          id: uuidv4(),
          name,
          price,
          description,
          source: sourceUrl,
          timestamp: new Date().toISOString(),
        });
      }
    });

    scrapedProducts.push(...products);
    console.log(`Scraped ${products.length} products from ${sourceUrl}`);
    await browser.close();
  } catch (error) {
    console.error('Scheduled scraping error:', error);
  }
});

async function startServer() {
  const server = new ApolloServer({ typeDefs, resolvers });
  const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },
  });
  console.log(`Server ready at ${url}`);
}

startServer();