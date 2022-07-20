import React, { Component, RefObject } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { io, Socket } from 'socket.io-client';

export type XtermProps = {
  sshServer?: string
}

type XTermState = {
  login: boolean;
}

const sshEvent = {
  emitConnect: 'ssh-connect',
  emitResize: 'ssh-resize',
  emitData: 'ssh-data',
  onConnectSuccess: 'ssh-connect-success',
  onConnectFalse: 'ssh-connect-false',
  onData: 'ssh-data'
}

class Xterm extends Component<XtermProps, XTermState> {
  // xterm
  terminal: Terminal;
  terminalRef: RefObject<HTMLDivElement>;
  fitAddon: FitAddon;

  // socket
  socket: Socket;
  sshServer: string;

  // use check
  eventResizeScreen: any;

  constructor({sshServer, ...props}: XtermProps) {
    
    super(props);
    this.terminalRef = React.createRef();
    this.state = { login: false };
    this.sshServer = sshServer || '192.168.6.84'

    this.setup();

    this.resizeScreen = this.resizeScreen.bind(this);
  }

  private setup () {
    this.terminal = new Terminal();
    this.fitAddon = new FitAddon();
  }

  resizeScreen() {
    if (!this.terminal || !this.socket) {
      console.log('[resizeScreen] chưa connect');
      return;
    }

    const { cols, rows } = this.terminal;
    this.fitAddon.fit();
    this.socket.emit(sshEvent.emitResize, { cols, rows });
    console.log(`[resizeScreen] cols: ${cols}, row: ${rows}`);
  }

  componentDidMount(): void {
    if (this.terminalRef.current && this.terminalRef.current.childElementCount == 0) {
      this.terminal.loadAddon(this.fitAddon);
      this.terminal.open(this.terminalRef.current);
      // this.terminal.write('Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ');
      this.fitAddon.fit();

      this.terminal.onData((data) => {
        if (!this.socket) {
          return console.log('[terminal-onData]: ', data);
        }
        this.socket.emit(sshEvent.emitData, data);
        console.log('[terminal-onData][ssh-data]: ', data)
      })
    } 

    if (!this.socket) {
      this.socket = io('http://localhost:3000', { path: '/api/socketio'})
      this.socket.on('connect', () => {
        console.log('[Socket] required connect ssh')
        setTimeout(() => {
          let { rows, cols } = this.terminal;
          this.socket.emit(sshEvent.emitConnect, { host: this.sshServer, rows, cols });
        })
      })

      this.socket.on(sshEvent.onConnectSuccess, ({ connectId }: { connectId: string }) => {
        console.log('[ssh-connect-success]: ', connectId);

        this.terminal.options.cursorBlink = true;
        this.terminal.options.scrollback = 10000;
        this.terminal.options.tabStopWidth = 8;
        this.terminal.options.bellStyle = 'sound';

        this.setState({login: true})
      })

      this.socket.on(sshEvent.onData, (data: string | Uint8Array) => {
        console.log('[SSH-DATA] - [REV]')
        this.terminal.write(data);
      })

      this.socket.on(sshEvent.onConnectFalse, ({ connectId }: { connectId: string }) => {
        console.log('[ssh-connect-false]: ', connectId);
        this.setState({login: false})
      })


      this.socket.on('disconnect', () => {
        this.setState({login: false})
      })
    }


    if (window && !this.eventResizeScreen) {
      this.eventResizeScreen = window.addEventListener('resize', this.resizeScreen, false);
    }
  }

  componentWillUnmount() {
    if (this.eventResizeScreen) {
      this.eventResizeScreen = null;
      window.removeEventListener('resize', this.resizeScreen, false);
    }
  }

  componentDidUpdate(preProps: XtermProps, prevState: XTermState) {
    if (this.state.login && this.state.login !== prevState.login) {
      // connect success
    }
  }

  render() {
    return <div ref={this.terminalRef} style={{ width: '100vw', height: '100vh'}}></div>
  }
}

export default Xterm;

