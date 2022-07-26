import React, { Component, RefObject } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { io, Socket } from 'socket.io-client';

const styles: any={}

export type XtermProps = {
  host: string
}

type XTermState = {
  login: 'loging' | 'logged' | 'logout';
  error?: any
}

const sshEvent = {
  emitConnect: 'ssh-connect',
  emitResize: 'ssh-resize',
  emitData: 'ssh-data',
  onConnectSuccess: 'ssh-connect-success',
  onError: 'ssh-error',
  onData: 'ssh-data'
}

const socketioConfig = {
  origin: 'http://dang.trong.nghia:3000',
  path: '/api/socketio'
}

class Xterm extends Component<XtermProps, XTermState> {
  // xterm
  terminal: Terminal;
  terminalRef: RefObject<HTMLDivElement|any>;
  fitAddon: FitAddon;

  // socket
  socket: Socket | null;
  host: string;

  // use check
  eventResizeScreen: any;

  constructor(props: XtermProps) {
    super(props);

    this.terminalRef = React.createRef();
    this.state = { login: 'loging' };
    this.host = props.host;

    this.setup();
  }

  private setup () {
    this.terminal = new Terminal();
    this.fitAddon = new FitAddon();
    this.resizeScreen = this.resizeScreen.bind(this);
  }

  resizeScreen() {
    if (this.terminal && this.socket) {
      const { cols, rows } = this.terminal;
      this.fitAddon.fit();
      this.socket.emit(sshEvent.emitResize, { cols, rows });
      console.log(`[+] resizeScreen cols: ${cols}, row: ${rows}`);
    } else {
      console.log('[-] resizeScreen chưa connect ssh');
    }
  }

  initialTerminal () {
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(this.terminalRef.current);
    // this.terminal.write('Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ');
    this.fitAddon.fit();

    this.terminal.onData((data) => {
      if (!this.socket) {
        return 
      }
      console.log('[+] user input data -> send data to server ', data)
      this.socket.emit(sshEvent.emitData, data);
    })
  }

  initialSocketConnect () {
    if (!this.socket) {
      this.socket = io(socketioConfig.origin, { path: socketioConfig.path})
      this.socket.on('connect', () => {
        console.log('[+] socket.io connected')
        this.setState({login: 'loging', error: null}, () => {
          setTimeout(() => {
            if  (this.socket) {
              let { rows, cols } = this.terminal;
              this.socket.emit(sshEvent.emitConnect, { host: this.host, rows, cols });
            }
          })
        })
      })

      this.socket.on(sshEvent.onConnectSuccess, ({ connectId }: { connectId: string }) => {
        console.log('[+] ssh connected: ', connectId);

        this.terminal.options.cursorBlink = true;
        this.terminal.options.scrollback = 10000;
        this.terminal.options.tabStopWidth = 8;
        this.terminal.options.bellStyle = 'sound';

        this.setState({login: 'logged'})
      })

      this.socket.on(sshEvent.onData, (data: string | Uint8Array) => {
        console.log('[+] server send data')
        this.terminal.write(data);
      })

      this.socket.on(sshEvent.onError, ({ error }: { error: any }) => {
        console.log('[ssh-connect-false]: ', error);
        this.setState({login: 'logout', error }, () => {
          this.socket?.disconnect();
          this.socket = null;
        })
      })

      this.socket.on('connect_error', (error) => {
        console.log('[-] socket connect error: ', error.message)
        this.socket?.disconnect();
        this.socket = null;
        this.setState({ login: 'logout', error: error.message })
      })

      this.socket.on('disconnect', () => {
        console.log('[-] socket disconnect')
        this.socket = null;
        this.setState({login: 'logout'})
      })
    }

  }

  componentDidMount(): void {
    if (this.terminalRef.current && this.terminalRef.current.childElementCount == 0) {
      this.initialTerminal();
    } 

    this.initialSocketConnect();

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

  renderTipSpin() {
    switch(this.state.login) {
      case 'loging': 
        return <div>
          {/* <LoadingOutlined className={styles['spin-icon']}/> */}
          <div className={styles['spin-text']}>Loging</div>
        </div>;
      case 'logged':
        return <div className={styles['spin-text']}>logged</div>
      default: 
        return (
          <div>
            {this.state.error && 
              <div className={styles['spin-text-error']}>Error Connect</div>
            }
            <button 
              onClick={() => {this.initialSocketConnect()}}
              // size="large"
              // icon={<LoginOutlined/>} 
            >
              Re-Connect
            </button>
          </div>
        );
    }
  }

  render() {
    return (
      <div 
        // tip={this.renderTipSpin()}
        // indicator={null}
        // spinning={this.state.login !== 'logged'}
      >
        <div ref={this.terminalRef} className={styles['terminal']}></div>
      </div>
    )
  }
}

export default Xterm;

