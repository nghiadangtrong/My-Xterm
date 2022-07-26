import { Server as NetServer, Socket as NetSocket } from 'net';
import { NextApiRequest, NextApiResponse } from 'next';
import { Server as ServerIO, Socket } from 'socket.io';
import { Client as SSH, ConnectConfig as ConnectConfigSSH } from 'ssh2';
import fs from 'fs';

import CorsMiddleware from 'middleware/cors';

type NextApiResponseServerIO = NextApiResponse & {
  socket: NetSocket & {
    server: NetServer & { io: ServerIO }
  }
}

const DataHOST: Array<{host: string, connectConfig: ConnectConfigSSH}> = [
  {
    host: '192.168.6.84',
    connectConfig: {
      host: '192.168.6.84',
      port: 22,
      username: 'xx',
      password: 'xxx',
      // passphrase: 'xxxxx',
      // privateKey: fs.readFileSync('/home/user/.ssh/id_rsa')
    } 
  },
]

const getHost = async (host: string): Promise<{host: string, connectConfig: ConnectConfigSSH} | undefined>=> {
  // return undefined
  return DataHOST[0];
  return DataHOST.find(item => item.host === host); 
}

type SshStatus = 'signingIn' | 'signedIn' | 'signOut' | 'error';

const getClientSSH = async (socket: Socket, configView: { host: string, term: string, cols: string, rows: string})
: Promise<{ end: ()=>any } | null | undefined > => {

  let sshStatus: SshStatus; 
  let connectSSH:SSH;
  connectSSH = new SSH();

  try {
    const hostConfig = await getHost(configView.host);
    console.log('[+] find host config: ', hostConfig)
    if (!hostConfig) {
      console.log('[-] Not Found host')
      throw new Error('Not Found Host')
    }

    const connectConfig: ConnectConfigSSH = {
      ...defaultConnectConfigSSH,
      ...hostConfig.connectConfig,
    }

    connectSSH.on('banner', (data) => {
      console.log('[SSH-BANNEL]: ', data);
      socket.emit('ssh-data', data.replace(/\r?\n/g, '\r\n').toString());
    });

    connectSSH.on('ready', () => {
      sshStatus = 'signingIn';

      console.log('[ssh-connect-success] ')
      socket.emit('ssh-connect-success', { connectId: socket.id })

      console.log(
        `[SSH-READY] [signedIn] user=${connectConfig.username} from=${socket.handshake.address} host=${connectConfig.host}:${connectConfig.port}`
      )

      let { term, cols, rows }: any = configView;
      connectSSH.shell({term, cols, rows }, (err, stream) => {
        if (err) {
          console.log('[CON-SSH-READY-ERROR]', err);

          sshStatus = 'error';
          connectSSH.end();
          socket.disconnect(true);
          return;
        }

        socket.on('ssh-resize', (data: { rows: string, cols: string, height: string,  width: string }) => {
          console.log('[client-resize] Client send resize to ssh ', data)
          stream.setWindow(data.rows, data.cols, data.height, data.width);
        });

        socket.on('ssh-data', (data) => {
          console.log('[client-send-data] Client send data to ssh', data);
          stream.write(data);
        })

        stream.on('data', (data: any) => {
          console.log('[ssh-send-data] SSH send data to client', data)
          socket.emit('ssh-data', data.toString());
        })

        stream.on('close', (code: any, signal: any) => {
          console.log('[STREAM-CLOSE]: ', { code, signal });
          sshStatus= 'signOut';
          socket.disconnect(true);
          connectSSH.end();
        })

        stream.stderr.on('data', (data) => {
          console.log('[ssh-stream-error]: STREAM-STDERR', data);
        })
        
      })
    })

    connectSSH.on('end', () => {
      console.log('[ssh-end]: ');
      sshStatus = 'signOut';
      socket.disconnect(true);
    })

    connectSSH.on('close', () => {
      console.log('[ssh-close]: ');
      sshStatus = 'signOut';
      socket.disconnect(true);
    })

    connectSSH.on('error', (error) => {
      console.log('[ssh-error]: ', error);
      sshStatus = 'error';
      socket.emit('ssh-error', { connectId: socket.id, error });
    })

    connectSSH.on('keyboard-interactive', (_name, _instructions, _instructionsLang, _prompts, finish) => {
      console.log('[keyboard-interactive]');
      if (connectConfig.username) {
        finish([connectConfig.username]);
      }
    });


    console.log('[+] Start connect to SSH: ', connectConfig.host)
    connectSSH.connect(connectConfig);
  } catch (e: any) {
    socket.emit('ssh-error', { error: e?.message });
    return 
  }

  return {
    end: () => {
      if (sshStatus) {
        connectSSH.end();
        sshStatus = 'signOut';
      }
    }
  }
  
}

const defaultConnectConfigSSH : ConnectConfigSSH= {
  algorithms: {
    kex: [
      'ecdh-sha2-nistp256',
      'ecdh-sha2-nistp384',
      'ecdh-sha2-nistp521',
      'diffie-hellman-group-exchange-sha256',
      'diffie-hellman-group14-sha1'
    ],
    cipher: [
      'aes128-ctr',
      'aes192-ctr',
      'aes256-ctr',
      'aes128-gcm@openssh.com',
      'aes256-gcm@openssh.com',
      'aes256-cbc'
    ],
    hmac: [ 'hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1' ],
    compress: [ 'none', 'zlib@openssh.com', 'zlib' ]
  },
  keepaliveInterval: 120000,
  keepaliveCountMax: 10,
  readyTimeout: 20000,
  tryKeyboard: true,
  port: 22
}

const socketio = async (req: NextApiRequest, res: NextApiResponseServerIO) => {
  await CorsMiddleware(req, res);

  if (!res?.socket?.server?.io) {
    const httpServer = res.socket.server as any;
    const io = new ServerIO(httpServer, {
      path: '/api/socketio',
      cors: {
        origin: ["http://localhost:4300"],
        credentials: true
      }
    })

    io.on('connect', socket => {

      let connectSSH: any;

      socket.on('ssh-connect', async (config: {host: string, term: string, rows: string, cols: string }) => {
        const {host, term, rows, cols } = config;

        console.log('[make-client-ssh]: ');
        connectSSH = getClientSSH(socket, { host, term, cols, rows })

      })

      socket.on('disconnect', async () => {
        console.log('[Socket-Disconnect]')
        if (connectSSH?.end) {
          connectSSH.end();
        }
      })
      
    })

    res.socket.server.io = io;

  }
  res.end();
}

export const config = {
  api: {
    bodyParse: false,
    origin: "http://localhost:4300"
  }
}

export default socketio;
