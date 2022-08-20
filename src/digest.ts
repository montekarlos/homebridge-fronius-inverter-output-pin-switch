import {Md5} from 'ts-md5/dist/md5';

/**
 * Extract from fronius javascript. Appears to be non standard digest algorithm
 */
export class Digest {

  AUTH_KEY_VALUE_RE = /(\w+)=["']?([^'"]+)["']?/;
  NC = 0;
  NC_PAD = '00000000';

  randomBytes(count: number) {
    let ret = '';
    for (let i = 0; i < count; i++) {
      ret = ret + Math.random().toString(16).substring(2, 4);
    }
    return ret;
  }

  md5(input: string) {
    return Md5.hashStr(input);
  }

  DigestHeader(method: string, uri: string, wwwAuthenticate: string, userpass: string) {
    const parts = wwwAuthenticate.split(',');
    const opts = {
      realm: '',
      nonce: '',
      qop: '',
      opaque: '',
    };
    for (let i = 0; i < parts.length; i++) {
      const m = parts[i].match(this.AUTH_KEY_VALUE_RE);
      if (m) {
        opts[m[1]] = m[2].replace(/["']/g, '');
      }
    }

    if (!opts.realm || !opts.nonce) {
      return '';
    }

    let qop = opts.qop || '';

    // WWW-Authenticate: Digest realm="testrealm@host.com",
    //                       qop="auth,auth-int",
    //                       nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093",
    //                       opaque="5ccc069c403ebaf9f0171e9517f40e41"
    // Authorization: Digest username="Mufasa",
    //                    realm="testrealm@host.com",
    //                    nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093",
    //                    uri="/dir/index.html",
    //                    qop=auth,
    //                    nc=00000001,
    //                    cnonce="0a4f113b",
    //                    response="6629fae49393a05397450978507c4ef1",
    //                    opaque="5ccc069c403ebaf9f0171e9517f40e41"
    // HA1 = MD5( "Mufasa:testrealm@host.com:Circle Of Life" )
    //      = 939e7578ed9e3c518a452acee763bce9
    //
    //  HA2 = MD5( "GET:/dir/index.html" )
    //      = 39aff3a2bab6126f332b942af96d3366
    //
    //  Response = MD5( "939e7578ed9e3c518a452acee763bce9:\
    //                   dcd98b7102dd2f0e8b11d0f600bfb0c093:\
    //                   00000001:0a4f113b:auth:\
    //                   39aff3a2bab6126f332b942af96d3366" )
    //           = 6629fae49393a05397450978507c4ef1
    const splitUserpass = userpass.split(':');

    let nc = String(++this.NC);
    nc = this.NC_PAD.substring(nc.length) + nc;

    const cnonce = this.randomBytes(8);

    const ha1 = this.md5(splitUserpass[0] + ':' + opts.realm + ':' + splitUserpass[1]);
    const ha2 = this.md5(method.toUpperCase() + ':' + uri);
    let s = ha1 + ':' + opts.nonce;
    if (qop) {
      qop = qop.split(',')[0];
      s += ':' + nc + ':' + cnonce + ':' + qop;
    }
    s += ':' + ha2;
    const response = this.md5(s);
    let authstring = 'Digest username="' + splitUserpass[0] + '", realm="' + opts.realm +
            '", nonce="' + opts.nonce + '", uri="' + uri +
            '", response="' + response + '"';
    if (opts.opaque) {
      authstring += ', opaque="' + opts.opaque + '"';
    }
    if (qop) {
      authstring += ', qop=' + qop + ', nc=' + nc + ', cnonce="' + cnonce + '"';
    }
    return authstring;
  }
}