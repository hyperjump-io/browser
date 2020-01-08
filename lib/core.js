const contentTypeParser = require("content-type");
const curry = require("just-curry-it");
const resolveUrl = require("url-resolve-browser");
const { uriReference, uriFragment, isObject } = require("./common");
const http = require("./fetch");


const construct = (url, status, headers, body) => Object.freeze({ url, status, headers, body });
const extend = (browser, extras) => {
  browser.documents[browser.url] = Object.freeze({ ...browser.documents[browser.url], ...extras });
  return browser;
};

const nil = {
  url: "",
  fragment: "",
  documents: {}
};
const source = (browser) => browser.documents[browser.url].body;
const value = (browser) => contentTypeHandler(browser).value(browser);

const fetch = curry((url, options = {}) => {
  const browser = get(url, nil, options);
  return wrapper(browser, options);
});

const get = async (url, browser, options = {}) => {
  const b = await browser;
  const resolvedUrl = resolveUrl(b.url, uriReference(url));
  const fragment = uriFragment(url);

  if (!(resolvedUrl in b.documents)) {
    const doc = await jump(resolvedUrl, options);
    b.documents[resolvedUrl] = doc;

    if (doc.status >= 400) {
      const result = { ...b, url: resolvedUrl, fragment: "" };
      throw await contentTypeHandler(result).get(result, options);
    }
  }

  const result = { ...b, url: resolvedUrl, fragment: fragment };
  return contentTypeHandler(result).get(result, options);
};

const step = curry(async (key, browser, options = {}) => {
  return contentTypeHandler(await browser).step(key, await browser, options);
});

const set = curry(async (newValue, browser) => {
  return contentTypeHandler(await browser).set(newValue, await browser);
});

const save = async (browser, options = {}) => {
  const subject = await browser;
  subject.documents[subject.url] = await jump(subject.url, {
    method: "PUT",
    headers: {
      ...options.headers,
      "Content-Type": subject.documents[subject.url].headers["content-type"]
    },
    body: contentTypeHandler(subject).stringify(subject)
  });

  if (subject.documents[subject.url].status >= 400) {
    const result = { ...subject, fragment: "" };
    throw await contentTypeHandler(result).get(result, options);
  } else {
    return contentTypeHandler(subject).get(subject, options);
  }
};

const jump = async (url, options) => {
  const response = await http(url, options);
  const headers = {};
  for (const [name, value] of response.headers.entries()) {
    headers[name] = value;
  }
  return construct(url, response.status, headers, await response.text());
};

const wrapper = (browser, options = {}) => {
  let target = browser.catch((error) => {
    if (isBrowser(error)) {
      throw wrapper(Promise.resolve(error), options);
    } else {
      throw error;
    }
  });

  return new Proxy(Promise.resolve(), {
    get: (_, propertyName) => {
      if (["then", "catch", "always"].includes(propertyName)) {
        const result = project(target, options);
        return result[propertyName].bind(result);
      } else if (propertyName === "$follow") {
        return (url, followOptions) => {
          const fullOptions = { ...options, ...followOptions };
          const nextDoc = get(url, target, fullOptions);
          return wrapper(nextDoc, fullOptions);
        };
      } else if (propertyName === "$source") {
        return target.then(value);
      } else if (propertyName === "$debug") {
        return target;
      } else if (propertyName === "$url") {
        return target.then((browser) => browser.fragment ? `${browser.url}#${browser.fragment}` : browser.url);
      } else if (propertyName === "$set") {
        return async (newValue) => {
          const result = set(newValue, target, options);
          return wrapper(save(result, options));
        };
      } else {
        const result = safeStep(propertyName, target, options);
        return wrapper(result, options);
      }
    }
  });
};

const isBrowser = (value) => isObject(value) && "url" in value;

const project = async (browser, options = {}) => {
  const docValue = value(await browser);

  if (isObject(docValue)) {
    return Object.keys(docValue).reduce((acc, key) => {
      const result = step(key, browser, options);
      acc[key] = wrapper(result, options);
      return acc;
    }, {});
  } else if (Array.isArray(docValue)) {
    return Object.keys(docValue).map((key) => {
      const result = step(key, browser, options);
      return wrapper(result, options);
    });
  } else {
    return docValue;
  }
};

const safeStep = async (propertyName, browser, options = {}) => {
  const docValue = value(await browser);
  const keys = typeof docValue === "object" ? Object.keys(docValue) : [];
  return keys.includes(propertyName) ? step(propertyName, browser, options) : undefined;
};

const contentTypes = {};

const defaultHandler = {
  get: (browser) => browser,
  set: (newValue, browser) => extend(browser, { body: newValue }),
  value: (browser) => isBrowser(browser) ? source(browser) : browser,
  stringify: (browser) => browser.documents[browser.url].body,
  step: (key, browser) => value(browser)[key]
};

const addContentType = (contentType, handler) => contentTypes[contentType] = handler;
const getContentType = (contentType) => contentTypes[contentType];

const contentTypeHandler = (browser) => {
  if (browser === nil || !isBrowser(browser)) {
    return defaultHandler;
  }

  const doc = browser.documents[browser.url];
  const contentType = "content-type" in doc.headers
    ? contentTypeParser.parse(doc.headers["content-type"]).type
    : "";
  return contentType in contentTypes ? contentTypes[contentType] : defaultHandler;
};

module.exports = {
  construct, extend,
  nil, source, get, fetch, step, set, save,
  addContentType, getContentType
};
