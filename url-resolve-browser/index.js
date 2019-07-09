/* eslint-disable */
'use strict';
module.exports = urlResolve;

/*
The majority of the module is built by following RFC1808
url: https://tools.ietf.org/html/rfc1808
*/

// adds a slash at end if not present
function _addSlash (url) {
  return url + (url[url.length-1] === '/' ? '' : '/');
}

// resolve the ..'s (directory up) and such
function _pathResolve (path) {
  let pathSplit = path.split('/');

  // happens when path starts with /
  if (pathSplit[0] === '') {
    pathSplit = pathSplit.slice(1);
  }

  // let segmentCount = 0; // number of segments that have been passed
  let resultArray = [];
  pathSplit.forEach((current, index) => {
    // skip occurances of '.'
    if (current !== '.') {
      if (current === '..') {
        resultArray.pop(); // remove previous
      } else if (current !== '') {
        resultArray.push(current);
      }
    }
  });
  return '/' + resultArray.join('/');
}

// parses a base url string into an object containing host, path and query
function _baseParse (base) {
  const resultObject = {
    host: '',
    path: '',
    query: '',
    protocol: ''
  };

  let path = base;
  let protocolEndIndex = base.indexOf('//');

  if (protocolEndIndex === -1) {
    throw new Error('Error, protocol is not specified');
  }

  resultObject.protocol = path.substring(0, protocolEndIndex);

  protocolEndIndex += 2; // add two to pass double slash

  const pathIndex = base.indexOf('/', protocolEndIndex);
  const queryIndex = base.indexOf('?');
  const hashIndex = base.indexOf('#');

  if (hashIndex !== -1) {
    path = path.substring(0, hashIndex); // remove hash, not needed for base
  }

  if (queryIndex !== -1) {
    const query = path.substring(queryIndex); // remove query, save in return obj
    resultObject.query = query;
    path = path.substring(0, queryIndex);
  }

  if (pathIndex !== -1) {
    const host = path.substring(0, pathIndex); // separate host & path
    resultObject.host = host;
    path = path.substring(pathIndex);
    resultObject.path = path;
  } else {
    resultObject.host = path; // there was no path, therefore path is host
  }

  return resultObject;
}

function _isAbsolute(relative) {
  // https://tools.ietf.org/html/rfc3986#section-3.1
  const scheme = '[a-z][a-z0-9+.-]*'; // ALPHA *( ALPHA / DIGIT / "+" / "-" / "."  )]
  const isAbsolutePattern = new RegExp(`^(${scheme}:)?//`, 'i');
  return isAbsolutePattern.test(relative);
}

// parses a relative url string into an object containing the href,
// hash, query and whether it is a net path, absolute path or relative path
function _relativeParse (relative) {
  const resultObject = {
    href: relative, // href is always what was passed through
    hash: '',
    query: '',
    netPath: false,
    absolutePath: false,
    relativePath: false
  };
  // check for protocol
  // if protocol exists, is net path (absolute URL)
  if (_isAbsolute(relative)) {
    resultObject.netPath = true;
    // return, in this case the relative is the resolved url, no need to parse.
    return resultObject;
  }

  // if / is first, this is an absolute path,
  // I.E. it overwrites the base URL's path
  if (relative[0] === '/') {
    resultObject.absolutePath = true;
    // return resultObject
  } else {
    resultObject.relativePath = true;
  }

  let path = relative;
  const queryIndex = relative.indexOf('?');
  const hashIndex = relative.indexOf('#');

  if (hashIndex !== -1) {
    const hash = path.substring(hashIndex);
    resultObject.hash = hash;
    path = path.substring(0, hashIndex);
  }

  if (queryIndex !== -1) {
    const query = path.substring(queryIndex);
    resultObject.query = query;
    path = path.substring(0, queryIndex);
  }

  resultObject.path = path; // whatever is left is path
  return resultObject;
}

function _shouldAddSlash (url) {
  const protocolIndex = url.indexOf('//') + 2;
  const noPath = !(url.includes('/', protocolIndex));
  const noQuery = !(url.includes('?', protocolIndex));
  const noHash = !(url.includes('#', protocolIndex));
  return (noPath && noQuery && noHash);
}

function _shouldAddProtocol (url) {
  return url.startsWith('//');
}

/*
* PRECONDITION: Base is a fully qualified URL. e.g. http://example.com/
* optional: path, query or hash
* returns the resolved url
*/
function urlResolve (base, relative) {
  base = base.trim();
  relative = relative.trim();

  // about is always absolute
  if (relative.startsWith('about:')) {
    return relative;
  }

  // if base is empty, assume relative is a net path.
  if (base === '') {
    if (_shouldAddSlash(relative)) {
      return _addSlash(relative);
    }
    // add / at end if not present if is only the host
    return relative;
  }
  const baseObj = _baseParse(base);
  // relative is empty, return base minus hash
  if (relative === '') {
    const {host, path, query} = baseObj;
    // when path and query aren't supplied add slash
    if ((!path) && (!query)) {
      return _addSlash(host);
    }
    return host + path + query;
  }

  const relativeObj = _relativeParse(relative);

  if (relativeObj.netPath) { // relative is full qualified URL
    if (_shouldAddProtocol(relativeObj.href)) {
      relativeObj.href = baseObj.protocol + relativeObj.href;
    }

    if (_shouldAddSlash(relativeObj.href)) {
      return _addSlash(relativeObj.href);
    }

    return relativeObj.href;
  } else if (relativeObj.absolutePath) { // relative is an absolute path
    const {path, query, hash} = relativeObj;

    return baseObj.host + _pathResolve(path) + query + hash;
  } else if (relativeObj.relativePath) { // relative is a relative path
    const {path, query, hash} = relativeObj;

    let basePath = baseObj.path;
    let resultString = baseObj.host;

    let resolvePath;

    if (path.length === 0) {
      resolvePath = basePath;
    } else {
      // remove last segment if no slash at end
      basePath = basePath.substring(0, basePath.lastIndexOf('/'));
      resolvePath = _pathResolve(basePath + '/' + path);
    }

    // if result is just the base host, add /
    if ((resolvePath === '') && (!query) && (!hash)) {
      resultString += '/';
    } else {
      resultString += resolvePath + query + hash;
    }

    return resultString;
  }
}
