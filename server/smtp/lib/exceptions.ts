export class SmtpException extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'SmtpException';
    }
}

export class TimeoutException extends SmtpException {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'TimeoutException';
    }
}

export class ConnectionClosedException extends SmtpException {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ConnectionClosedException';
    }
}

export class InvalidResponseException extends SmtpException {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'InvalidResponseException';
    }
}

export class EhloUnsuccessfulException extends SmtpException {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'EhloUnsuccessfulException';
    }
}

export class StartTlsUnsuccessfulException extends SmtpException {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'StartTlsUnsuccessfulException';
    }
}

export class AlreadySecuredException extends SmtpException {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'AlreadySecuredException';
    }
}
