import { Context, Hono } from 'hono'
import { GraphQLFetcher } from './request'
import { convertArticlesToRSS } from './utils'

// const defaultUrl = 'https://api-prod.omnivore.app/api/graphql'

const defaultUrl = 'http://localhost:4000/api/graphql'


type Bindings = {
  OMNIVORE_API_URL: string
  OMNIVORE_AUTH_TOKEN: string
  PUBLIC_MODE: string
}

type OmniOptions = {
  reqUrl: string
  limit?: number,
  query?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c) => {
  if (c.env.PUBLIC_MODE) {
    return c.text('Public mode enabled, please use the /public?token=<your omnivore token> endpoint.')
  }
  return c.json({
    msg: 'Server is ready.'
  })
})

app.get('/feed', async (c) => {
  if (c.env.PUBLIC_MODE) {
    return c.json({
      msg: 'Public mode enabled, please use the /public endpoint.'
    })
  }
  const { limit, query = '' } = c.req.query()
  const omniUrl = c.env.OMNIVORE_API_URL ?? defaultUrl
  const token = c.env.OMNIVORE_AUTH_TOKEN
  // singleton
  const api = GraphQLFetcher.getInstance(omniUrl, token)
  const feed = await handleTransform(api, {
    reqUrl: c.req.url,
    limit: parseInt(limit),
    query
  })
  c.header('Content-Type', 'application/xml')
  return c.body(feed)
})

app.get('/public', async (c) => {
  if (!c.env.PUBLIC_MODE) {
    return c.json({
      msg: 'Public mode disabled, please use the /feed endpoint.'
    })
  }
  const { token, limit, query = '' } = c.req.query()
  if (!token) {
    return c.json({
      msg: 'In public mode, please provide a token, or you can deploy it yourself on cloudflare.'
    })
  }
  const omniUrl = c.env.OMNIVORE_API_URL ?? defaultUrl
  // per request instance
  const api = new GraphQLFetcher(omniUrl, token)
  const feed = await handleTransform(api, {
    reqUrl: c.req.url,
    limit: parseInt(limit),
    query
  })
  c.header('Content-Type', 'application/xml')
  return c.body(feed)
})

// async function handleTransform (api: GraphQLFetcher, options: OmniOptions) {
//   const { reqUrl, limit = 10, query = '' } = options
//   const data = await api.request(undefined, limit, query)
//   const articles = data.data.search.edges
//   const feed = convertArticlesToRSS(articles, reqUrl)
//   return feed
// }


// 新的、带日志记录的代码
async function handleTransform (api: GraphQLFetcher, options: OmniOptions) {
  try {
    const { reqUrl, limit = 10, query = '' } = options
    const data = await api.request(undefined, limit, query);

    // 关键步骤：打印从 Omnivore API 返回的原始数据，用于调试
    console.log("Response from Omnivore API:", JSON.stringify(data, null, 2));

    // 检查返回的数据结构是否正确，如果不正确就抛出错误
    if (!data?.data?.search?.edges) {
      console.error("Invalid response structure from Omnivore API. This might be due to an invalid API token.");
      throw new Error("Failed to get articles from Omnivore. Check the worker logs for the raw API response.");
    }

    const articles = data.data.search.edges;
    const feed = convertArticlesToRSS(articles, reqUrl);
    return feed;
  } catch (e) {
    // 如果上面的任何步骤出错，在这里捕获并打印详细的错误信息
    console.error("An error occurred in handleTransform function:", e);
    // 重新抛出错误，这样外部依然会看到 500，但我们得到了日志
    throw e;
  }
}


export default app
