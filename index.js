import { ApolloServer } from '@apollo/server'
import { startStandaloneServer } from '@apollo/server/standalone'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Author from './models/author.js'
import Book from './models/book.js'
import { v4 as uuidv4 } from 'uuid'

mongoose.set('strictQuery', false)
dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

console.log('conecting to..', MONGODB_URI)

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('conected to MongoDB')
  })
  .catch(error => {
    console.log('error connection to MongoDB', error.message)
  })

let authors = [
  {
    name: 'Robert Martin',
    id: 'afa51ab0-344d-11e9-a414-719c6709cf3e',
    born: 1952,
  },
  {
    name: 'Martin Fowler',
    id: 'afa5b6f0-344d-11e9-a414-719c6709cf3e',
    born: 1963,
  },
  {
    name: 'Fyodor Dostoevsky',
    id: 'afa5b6f1-344d-11e9-a414-719c6709cf3e',
    born: 1821,
  },
  {
    name: 'Joshua Kerievsky', // birthyear not known
    id: 'afa5b6f2-344d-11e9-a414-719c6709cf3e',
  },
  {
    name: 'Sandi Metz', // birthyear not known
    id: 'afa5b6f3-344d-11e9-a414-719c6709cf3e',
  },
]

let books = [
  {
    title: 'Clean Code',
    published: 2008,
    author: 'Robert Martin',
    id: 'afa5b6f4-344d-11e9-a414-719c6709cf3e',
    genres: ['refactoring'],
  },
  {
    title: 'Agile software development',
    published: 2002,
    author: 'Robert Martin',
    id: 'afa5b6f5-344d-11e9-a414-719c6709cf3e',
    genres: ['agile', 'patterns', 'design'],
  },
  {
    title: 'Refactoring, edition 2',
    published: 2018,
    author: 'Martin Fowler',
    id: 'afa5de00-344d-11e9-a414-719c6709cf3e',
    genres: ['refactoring'],
  },
  {
    title: 'Refactoring to patterns',
    published: 2008,
    author: 'Joshua Kerievsky',
    id: 'afa5de01-344d-11e9-a414-719c6709cf3e',
    genres: ['refactoring', 'patterns'],
  },
  {
    title: 'Practical Object-Oriented Design, An Agile Primer Using Ruby',
    published: 2012,
    author: 'Sandi Metz',
    id: 'afa5de02-344d-11e9-a414-719c6709cf3e',
    genres: ['refactoring', 'design'],
  },
  {
    title: 'Crime and punishment',
    published: 1866,
    author: 'Fyodor Dostoevsky',
    id: 'afa5de03-344d-11e9-a414-719c6709cf3e',
    genres: ['classic', 'crime'],
  },
  {
    title: 'Demons',
    published: 1872,
    author: 'Fyodor Dostoevsky',
    id: 'afa5de04-344d-11e9-a414-719c6709cf3e',
    genres: ['classic', 'revolution'],
  },
]

const typeDefs = `
  type Author {
    name: String!
    born: Int
    id: ID!
    bookCount: Int!
  }

  type Book {
    title: String!
    published: Int!
    author: Author!
    genres: [String!]!
    id: ID!
  }

  type Mutation {
    addBook(
      title: String!
      author: String!
      published: Int!
      genres: [String!]!
     ): Book!
     editAuthor(
      name: String!
      setBornTo: Int!
     ): Author
}

  type Query {
    authorCount: Int!
    bookCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]!
  }
`

const resolvers = {
  Query: {
    authorCount: async () => Author.collection.countDocuments(),
    bookCount: async () => Book.collection.countDocuments(),
    allBooks: (root, args) => {
      let filteredBooks = books

      if (args.author) {
        filteredBooks = filteredBooks.filter(
          book => book.author === args.author
        )
      }

      if (args.genre) {
        filteredBooks = filteredBooks.filter(book =>
          book.genres.includes(args.genre)
        )
      }
      return filteredBooks
    },
    allAuthors: () => {
      const authorDetails = authors.map(author => ({
        ...author,
        bookCount: books.filter(book => book.author === author.name).length,
      }))
      return authorDetails
    },
  },
  Mutation: {
    addBook: async (root, args) => {
      const { title, author: authorName, published, genres } = args

      let author = await Author.findOne({ name: authorName })

      if (!author) {
        author = new Author({ name: author })
        await author.save()
      }

      const newBook = new Book({
        title,
        published,
        genres,
        author: author._id,
      })
      await newBook.save()
      return newBook.populate('author')
    },
    editAuthor: (root, args) => {
      const { name, setBornTo } = args
      const author = authors.find(a => a.name === name)
      if (!author) return null

      const updatedAuthor = {
        ...author,
        born: setBornTo,
        bookCount: books.filter(book => book.author === name).length,
      }
      authors = authors.map(a => (a.name === name ? updatedAuthor : a))
      return updatedAuthor
    },
  },
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

startStandaloneServer(server, {
  listen: { port: 4000 },
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})
