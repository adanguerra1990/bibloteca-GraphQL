import { ApolloServer } from '@apollo/server'
import { startStandaloneServer } from '@apollo/server/standalone'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Author from './models/author.js'
import Book from './models/book.js'
import User from './models/user.js'
import jwt from 'jsonwebtoken'
import { GraphQLError } from 'graphql'

mongoose.set('strictQuery', false)
dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined')
}

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
  type User {
    username: String!
    favoriteGenre: String!
    id: ID!
  }

  type Token {
    value: String!
  }
    

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

     createUser(
       username: String!
       favoriteGenre: String!
     ): User

     login(
       username: String!
       password: String!
     ): Token
}

  type Query {
    authorCount: Int!
    bookCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]!
    me: User
  }
`

const resolvers = {
  Query: {
    authorCount: async () => Author.collection.countDocuments(),
    bookCount: async () => Book.collection.countDocuments(),
    allBooks: async (root, args) => {
      let filteredBooks = {}

      if (args.author) {
        const author = await Author.findOne({ name: args.author })
        if (author) {
          filteredBooks.author = author._id
        }
      }

      if (args.genres) {
        filteredBooks.genres = { $in: [args.genres] }
      }

      const books = await Book.find(filteredBooks).populate('author')

      const bookDetails = books.map(async book => {
        const bookCount = await Book.collection.countDocuments({
          author: book.author._id,
        })

        return {
          ...book.toObject(),
          id: book._id.toString(),
          author: {
            ...book.author.toObject(),
            id: book.author._id.toString(),
            bookCount,
          },
        }
      })
      return bookDetails
    },
    allAuthors: async () => {
      const authors = await Author.find({})
      const authorDetails = authors.map(async author => {
        const bookCount = await Book.collection.countDocuments({
          author: author._id,
        })
        return {
          ...author.toObject(),
          id: author._id.toString(),
          bookCount,
        }
      })
      return authorDetails
    },
    me: (root, args, context) => {
      return context.currentUser
    },
  },
  Mutation: {
    addBook: async (root, args, context) => {
      if (!context.currentUser) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHORIZED' },
        })
      }

      const { title, author: authorName, published, genres } = args

      if (title.length < 2) {
        throw new GraphQLError('Title must be at least 2 characters long', {
          extensions: { code: 'BAD_USER_INPUT' },
        })
      }

      if (authorName.length < 4) {
        throw new GraphQLError(
          'Author name must be at least 4 characters long',
          {
            extensions: { code: 'BAD_USER_INPUT' },
          }
        )
      }

      try {
        let author = await Author.findOne({ name: authorName })

        if (!author) {
          author = new Author({ name: authorName })
          await author.save()
        }

        const newBook = new Book({
          title,
          published,
          author: author._id,
          genres,
        })
        await newBook.save()

        return newBook.populate('author')
      } catch (error) {
        if (error.name === 'ValidationError') {
          throw new GraphQLError(error.message, {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }
        throw new GraphQLError('Something went wrong', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        })
      }
    },
    editAuthor: async (root, args, context) => {
      const { name, setBornTo } = args

      const author = await Author.findOne({ name })

      if (!author) {
        throw new GraphQLError('Author not found', {
          extensions: { code: 'NOT_FOUND' },
        })
      }

      if (!context.currentUser) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHORIZED' },
        })
      }

      try {
        author.born = setBornTo
        await author.save()
        return author
      } catch (error) {
        if (error.name === 'ValidationError') {
          throw new GraphQLError(error.message, {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }
        throw new GraphQLError('Something went wrong', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        })
      }
    },

    createUser: async (root, args) => {
      const { username, favoriteGenre } = args

      if (username.length < 3) {
        throw new GraphQLError('Username must be at least 3 characters long', {
          extensions: { code: 'BAD_USER_INPUT' },
        })
      }

      try {
        const user = new User({ username, favoriteGenre })
        await user.save()
        return user
      } catch (error) {
        if (error.name === 'ValidationError') {
          throw new GraphQLError(error.message, {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }
        throw new GraphQLError('Something went wrong', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        })
      }
    },

    login: async (root, args) => {
      const { username, password } = args

      if (password !== 'secret') {
        throw new GraphQLError('Invalid password', {
          extensions: { code: 'UNAUTHORIZED' },
        })
      }

      const user = await User.findOne({ username })

      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        })
      }

      const userForToken = {
        username: user.username,
        id: user._id,
      }

      return { value: jwt.sign(userForToken, JWT_SECRET) }
    },
  },
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

startStandaloneServer(server, {
  listen: { port: 4000 },
  context: async ({ req, res }) => {
    const auth = req ? req.headers.authorization : null

    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      const token = auth.substring(7)
      try {
        const decodedToken = jwt.verify(token, JWT_SECRET)
        const currentUser = await User.findById(decodedToken.id)
        return { currentUser }
      } catch (error) {
        console.error('invalid token', error)
      }
    }

    return { currentUser: null }
  },
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})
