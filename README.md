# passwordless-api
Demo application for passwordless authentication using Auth0.  This is the server portion of the demo.  A client demo is also [available on GitHub](https://github.com/mhuensch/passwordless-web) as well.

### Overview
I often find that I want to authenticate users but don't want to invest in the overhead it takes to setup and manage a custom authentication process.  On the other hand, I also don't want to be locked into a particular vendor or experience over the long term.  This demo project represents the best compromise I've found between those two desires.

#### Auth0
I've used Auth0 in the past for basic user authentication and found it to be a bit clunky.  With the introduction of passwordless authentication everything changed.  There are other companies that offer this functionality as well (magic.link, cotter.app, etc.), but they all have trade-offs I'm not willing to accept in terms of price or customizing the experience.

#### Passwordless
Passwordless (aka Magic Link) authentication offers a number of advantages over traditional user/password login experiences.  Briefly the flow looks something like:

* The user provides a contact point that is also used as an identifier (usually an email address or phone number).
* A message is sent to the point of contact with a short-lived, randomly generated, code.  This code can be embedded in a referral link for easier use.
* That code is verified and the user's device, browser, or application is authenticated for a period of time.

In terms of experience and logical flow, this process looks very similar to a password reset or two-factor authentication.  Given the average user's familiarity with these processes, passwordless logins add very little mental overhead to the user experience and removes the need to remember passwords entirely.

For more information, see [Passwords are Obsolete](https://medium.com/@ninjudd/passwords-are-obsolete-9ed56d483eb) by Justin Balthrop.

#### Objectives
* Quick initial setup
* Custom user experience
* Low maintenance and cost
* Clean, simple, and repeatable
