import { Server as NetServer, Socket as NetSocket } from 'net';
import { NextApiRequest, NextApiResponse } from 'next';
import { Server as ServerIO, Socket } from 'socket.io';
import { Client as SSH, ConnectConfig as ConnectConfigSSH } from 'ssh2';

type NextApiResponseServerIO = NextApiResponse & {
  socket: NetSocket & {
    server: NetServer & { io: ServerIO }
  }
}

const DataHOST: Array<{host: string, connectConfig: ConnectConfigSSH}> = [
  {
    host: '192.x.x.x.x',
    connectConfig: {
      host: '192.168.x.x',
      port: 22,
      username: 'user',
      password: 'password'
    } 
  }
]

const getHost = (host: string): {host: string, connectConfig: ConnectConfigSSH} | undefined => DataHOST.find(item => item.host === host); 

const sshConnects: {[key: string]: { clientSSH?: { end: ()=>any, isConnect: boolean }, connectConfigSSH?: ConnectConfigSSH }} = {};

const getClientSSH = (socket: Socket, connectConfig: ConnectConfigSSH, configView: { term: string, cols: string, rows: string}): { end: ()=>any, isConnect: boolean } => {
  let isConnect: boolean = false; 
  let connectSSH = new SSH();
  
  connectSSH.on('banner', (data) => {
    console.log('[CON-SSH-BANNEL]: ', data);
    socket.emit('ssh-data', data.replace(/\r?\n/g, '\r\n').toString());
  });

  connectSSH.on('ready', () => {
    console.log('[CON-SSH-READY]: ');
    console.log(
      `LOGIN user=${connectConfig.username} from=${socket.handshake.address} host=${connectConfig.host}:${connectConfig.port}`
    )
    isConnect = true;
    let { term, cols, rows }: any = configView;
    connectSSH.shell({term, cols, rows }, (err, stream) => {
      if (err) {
        console.log('[CON-SSH-READY-ERROR]', err);
        connectSSH.end();
        socket.disconnect(true);
      }

      socket.on('ssh-resize', (data: { rows: string, cols: string, height: string,  width: string }) => {
        console.log('[SSH-RESIZE]: ', data)
        stream.setWindow(data.rows, data.cols, data.height, data.width);
      })

      socket.on('ssh-data', (data) => {
        console.log(['Client-SEND-TO-SEVER][SSH-DATA'], data);
        stream.write(data);
      })

      stream.on('data', (data: any) => {
        console.log('[STREAM-SSH-DATA]', data)
        socket.emit('ssh-data', data.toString());
      })

      stream.on('close', (code: any, signal: any) => {
        console.log('[STREAM-CLOSE]: ', { code, signal });
        isConnect= false;
        socket.disconnect(true);
        connectSSH.end();
      })

      stream.stderr.on('data', (data) => {
        console.log('[STREAM-STDERR]: ', data)
      })
      
    })
  })

  connectSSH.on('end', () => {
    console.log('[CON-SSH-END]: ');
    socket.disconnect(true);
    isConnect = false;
  })

  connectSSH.on('close', () => {
    console.log('[CON-SSH-CLOSE]: ');
    socket.disconnect(true);
    isConnect = false;
  })

  connectSSH.on('error', (error) => {
    console.log('[CON-SSH-CLOSE]: ', error);
    isConnect = false;
  })
  connectSSH.on('keyboard-interactive', (_name, _instructions, _instructionsLang, _prompts, finish) => {
    console.log('[CON-SSH-keyboard-interactive]');
    if (connectConfig.username) {
      finish([connectConfig.username]);
    }
  });

  connectSSH.connect(connectConfig);

  return {
    end: () => {
      if (isConnect) {
        connectSSH.end();
        isConnect = false;
      }
    },
    isConnect: isConnect  
  };
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

const socketio = (req: NextApiRequest, res: NextApiResponseServerIO) => {
  if (!res?.socket?.server?.io) {
    const httpServer = res.socket.server as any;
    const io = new ServerIO(httpServer, {
      path: '/api/socketio'
    })

    io.on('connect', socket => {

      socket.on('ssh-connect', async (config: {host: string, term: string, rows: string, cols: string }) => {
        const {host, term, rows, cols } = config;
        // handle connect ssh
        const hostObject = getHost(host);

        if (hostObject) {
          const connectConfigSSH: ConnectConfigSSH = {
            ...defaultConnectConfigSSH,
            ...hostObject.connectConfig,
          }
          console.log('[ssh-connect]: ')
          console.log({  hostObject, config })
            let clientSSH = getClientSSH(socket, connectConfigSSH, { term, cols, rows });
            let _interval = setInterval(() => {
              if (clientSSH.isConnect) {
                console.log('[Check-Interval-conenctSSH] ')
                sshConnects[socket.id] = { clientSSH , connectConfigSSH };
                socket.emit('ssh-connect-success', { connectId: socket.id })
                clearInterval(_interval);
              }
            }, 1000)
        } else {
          sshConnects[socket.id] = { clientSSH: undefined, connectConfigSSH: undefined };
          socket.emit('ssh-connect-false', { connectId: socket.id });
        }
      })

      socket.on('ssh-disconnect', async () => {
        console.log('[SOCK-SSH-DISCONNECT]: ')
        if (!sshConnects[socket.id]) {
          socket.disconnect(true);
          return;
        }
        // handle disconnect ssh
        sshConnects[socket.id]?.clientSSH?.end();
      })

      socket.on('error', (err) => {
        console.log('[SOCK-ERROR]: ', err)
        if (!sshConnects[socket.id]) {
          socket.disconnect(true);
          return;
        }

        sshConnects[socket.id]?.clientSSH?.end();
        delete sshConnects[socket.id];
      });

      socket.on('disconnect', async () => {
        console.log('[SOCK-DISCONNECT]: ')
        if (!sshConnects[socket.id]) {
          socket.disconnect(true);
          return;
        }

        sshConnects[socket.id]?.clientSSH?.end();
        delete sshConnects[socket.id];
      })
      
    })

    res.socket.server.io = io;

  }
  res.end();
}

export const config = {
  api: {
    bodyParse: false
  }
}

export default socketio;
