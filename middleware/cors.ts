import { NextApiRequest, NextApiResponse } from 'next';
import Cors, { CorsOptions, CorsOptionsDelegate } from 'cors';

// Initializing the cors middleware
// You can read more about the available options here: https://github.com/expressjs/cors#configuration-options

function runMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  corsOption?: CorsOptions | CorsOptionsDelegate<Cors.CorsRequest> | undefined
) {
  const cors = Cors({
    origin: "*",
    methods: ["GET", "POST", "HEAD"],
    ...corsOption
  })
  return new Promise((resolve, reject) => {
    cors(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result)
      }

      return resolve(result)
    })
  })
}

export default runMiddleware
