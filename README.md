# tinymoji 😀💻

Powered by [Webtask.io](https://webtask.io)

Frontend hosted on [DigitalOcean](https://digitalocean.com)

## Use your own domain

1. Get (or use an existing) domain and setup to point at your own webserver. 
2. Host index.html on your domain. 
3. Setup /r as a proxy_pass to the [tinymoji webtask](https://wt-9dcfb2cd6e8f574d568dba79bdf6aa94-0.run.webtask.io/tinymoji).
4. Change newLink in the ajax success function to use your domain.

Recommended: Setup https using [Let's Encrypt](https://letsencrypt.org) and redirect all http to https.

## Full setup

1. Follow the __Use your own domain__ steps (except step 3).
2. Create a network accessible MongoDB instance (I used [mLab](https://mlab.com)) with a user for the webtask.
3. Deploy tinymoji.js to [webtask](https://webtask.io).
4. Create a MONGO_URL secret for the webtask pointing to your MongoDB instance.
5. Setup /r as a proxy_pass to your new webtask.
6. Update the webtask url in index.html to point to your new webtask.

## Proxy pass setup for nginx

nginx resolves DNS entries at startup, which doesn't work in this case because webtasks change IPs regularly. So, to force nginx to resolve the entry each time, we store it in a variable and rewrite the url to point to the webtask path (in my case, this in /tinymoji). Also, serve up a robots.txt file before the proxy pass if you use /r. Otherwise, nginx will try to follow the proxy pass and mangle the domain with the file name when robots.txt is requested. 

Here is a sample nginx location setup.

```
location / {
        try_files $uri $uri/ =404;
}

location /robots.txt {
        return 200 "User-agent: *\nDisallow: /\n";
}

location /r {
        resolver 8.8.8.8;
        set $webtask "WebtaskUrl";

        rewrite ^/r/(.*) /tinymoji/$1 break;
        proxy_pass $webtask;
}
```

## Todo
- [ ] Cache top n results in webtask storage - less network/db calls
- [ ] Track more analytics (locations who clicked link, etc)
- [ ] Add user account setup to track link analytics
- [ ] Move these todos to a Project on the repo
